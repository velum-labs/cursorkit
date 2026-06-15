import fs from "node:fs";
import http, {
  type IncomingHttpHeaders,
  type IncomingMessage,
} from "node:http";
import type { AddressInfo } from "node:net";

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it } from "vitest";

import type { BridgeConfig } from "../src/config.js";
import { encodeEnvelope, firstMessagePayload } from "../src/connectEnvelope.js";
import {
  GetDefaultModelRequestSchema,
  GetDefaultModelResponseSchema,
  StreamUnifiedChatRequestWithToolsSchema,
  UploadIssueTraceRequestSchema,
  UploadIssueTraceResponseSchema,
} from "../src/gen/aiserver/v1/aiserver_pb.js";
import {
  AgentClientMessageSchema,
  AgentRunRequestSchema,
  ConversationActionSchema,
  RequestedModelSchema,
  UserMessageActionSchema,
  UserMessageSchema,
} from "../src/gen/agent/v1/agent_pb.js";
import { createLogger } from "../src/logger.js";
import { classifyRoute } from "../src/routes.js";
import { createBridgeRuntime, startServer } from "../src/server.js";

interface RouteContractEntry {
  path: string;
  policy: "intercept" | "observe-only" | "pass-through";
  expectedMethods: string[];
  expectedContentTypes: string[];
}

interface ObservedRequest {
  method: string;
  path: string;
  contentType: string | undefined;
  body: Buffer;
}

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
  servers.length = 0;
});

describe("protocol route shapes", () => {
  it("classifies owned intercept routes by manifest method and content type", () => {
    for (const route of interceptRoutesFromManifest()) {
      for (const method of route.expectedMethods) {
        for (const contentType of route.expectedContentTypes) {
          const decision = classifyRoute(
            fakeRequest(route.path, method, contentType),
          );

          expect(decision).toMatchObject({
            path: route.path,
            policy: "intercept",
          });
        }
      }
    }
  });

  it("passes incompatible owned route shapes through by default", () => {
    for (const route of interceptRoutesFromManifest()) {
      expect(
        classifyRoute(fakeRequest(route.path, "PUT", "application/proto")),
      ).toMatchObject({
        path: route.path,
        policy: "pass-through",
      });
      expect(
        classifyRoute(
          fakeRequest(route.path, "POST", "application/x-protobuf"),
        ),
      ).toMatchObject({
        path: route.path,
        policy: "pass-through",
      });
    }
  });

  it("keeps proto-visible but unowned routes as pass-through", () => {
    for (const path of [
      "/agent.v1.AgentService/RunPoll",
      "/agent.v1.ControlService/Ping",
      "/aiserver.v1.ChatService/StreamUnifiedChatWithToolsSSE",
      "/aiserver.v1.ChatService/StreamUnifiedChatWithToolsPoll",
      "/aiserver.v1.ChatService/StreamUnifiedChatWithToolsIdempotent",
      "/aiserver.v1.ChatService/StreamUnifiedChatWithToolsIdempotentSSE",
      "/aiserver.v1.ChatService/StreamUnifiedChatWithToolsIdempotentPoll",
    ]) {
      expect(
        classifyRoute(fakeRequest(path, "POST", "application/connect+proto")),
      ).toMatchObject({ path, policy: "pass-through" });
    }
  });

  it("passes incompatible owned route requests upstream without changing bodies", async () => {
    const { server: upstream, observed } = await startRecordingUpstream();
    const bridge = await startTestBridge({
      upstreamBaseUrl: `http://127.0.0.1:${portOf(upstream)}`,
    });

    for (const route of interceptRoutesFromManifest()) {
      for (const scenario of [
        {
          method: "PUT",
          contentType: "application/proto",
          body: Buffer.from(`bad-method:${route.path}`),
        },
        {
          method: "POST",
          contentType: "application/x-protobuf",
          body: Buffer.from(`bad-content-type:${route.path}`),
        },
      ]) {
        const response = await fetch(
          `http://127.0.0.1:${portOf(bridge)}${route.path}`,
          {
            method: scenario.method,
            headers: { "content-type": scenario.contentType },
            body: new Uint8Array(scenario.body),
          },
        );
        const observedIndex = Number(response.headers.get("x-observed-index"));

        expect(response.status).toBe(209);
        expect(observed[observedIndex]).toMatchObject({
          method: scenario.method,
          path: route.path,
          contentType: scenario.contentType,
        });
        expect(observed[observedIndex]?.body).toEqual(scenario.body);
      }
    }
  });

  it("passes unowned proto-visible route requests upstream unchanged", async () => {
    const { server: upstream, observed } = await startRecordingUpstream();
    const bridge = await startTestBridge({
      upstreamBaseUrl: `http://127.0.0.1:${portOf(upstream)}`,
    });

    for (const path of [
      "/agent.v1.AgentService/RunPoll",
      "/agent.v1.ControlService/Ping",
      "/aiserver.v1.ChatService/StreamUnifiedChatWithToolsSSE",
      "/aiserver.v1.ChatService/StreamUnifiedChatWithToolsPoll",
      "/aiserver.v1.ChatService/StreamUnifiedChatWithToolsIdempotent",
      "/aiserver.v1.ChatService/StreamUnifiedChatWithToolsIdempotentSSE",
      "/aiserver.v1.ChatService/StreamUnifiedChatWithToolsIdempotentPoll",
    ]) {
      const body = encodeEnvelope(Buffer.from(`unowned:${path}`));
      const response = await fetch(
        `http://127.0.0.1:${portOf(bridge)}${path}`,
        {
          method: "POST",
          headers: { "content-type": "application/connect+proto" },
          body: new Uint8Array(body),
        },
      );
      const observedIndex = Number(response.headers.get("x-observed-index"));

      expect(response.status).toBe(209);
      expect(observed[observedIndex]).toMatchObject({
        method: "POST",
        path,
        contentType: "application/connect+proto",
      });
      expect(observed[observedIndex]?.body).toEqual(body);
    }
  });

  it("passes malformed Connect framing upstream for owned intercept routes", async () => {
    const { server: upstream, observed } = await startRecordingUpstream();
    const bridge = await startTestBridge({
      upstreamBaseUrl: `http://127.0.0.1:${portOf(upstream)}`,
    });
    const malformedFrame = Buffer.from([0, 0, 0, 0, 8, 1, 2]);

    const response = await fetch(
      `http://127.0.0.1:${portOf(bridge)}/aiserver.v1.AiService/AvailableModels`,
      {
        method: "POST",
        headers: { "content-type": "application/connect+proto" },
        body: new Uint8Array(malformedFrame),
      },
    );
    const observedIndex = Number(response.headers.get("x-observed-index"));

    expect(response.status).toBe(209);
    expect(observed[observedIndex]).toMatchObject({
      method: "POST",
      path: "/aiserver.v1.AiService/AvailableModels",
      contentType: "application/connect+proto",
    });
    expect(observed[observedIndex]?.body).toEqual(malformedFrame);
  });

  it("handles incompatible local model selections explicitly", async () => {
    const { server: upstream, observed } = await startRecordingUpstream();
    const bridge = await startTestBridge({
      upstreamBaseUrl: `http://127.0.0.1:${portOf(upstream)}`,
    });
    const chatBody = encodeEnvelope(
      toBinary(
        StreamUnifiedChatRequestWithToolsSchema,
        create(StreamUnifiedChatRequestWithToolsSchema, {
          streamUnifiedChatRequest: {
            modelDetails: { modelName: "upstream-model" },
            conversation: [{ text: "hello", type: 1 }],
            isChat: true,
          },
        }),
      ),
    );

    const chatResponse = await fetch(
      `http://127.0.0.1:${portOf(bridge)}/aiserver.v1.ChatService/StreamUnifiedChatWithTools`,
      {
        method: "POST",
        headers: { "content-type": "application/connect+proto" },
        body: new Uint8Array(chatBody),
      },
    );
    const chatObservedIndex = Number(
      chatResponse.headers.get("x-observed-index"),
    );

    expect(chatResponse.status).toBe(209);
    expect(observed[chatObservedIndex]).toMatchObject({
      method: "POST",
      path: "/aiserver.v1.ChatService/StreamUnifiedChatWithTools",
      contentType: "application/connect+proto",
    });
    expect(observed[chatObservedIndex]?.body).toEqual(chatBody);

    const agentRunBody = encodeEnvelope(
      toBinary(
        AgentClientMessageSchema,
        create(AgentClientMessageSchema, {
          runRequest: create(AgentRunRequestSchema, {
            requestedModel: create(RequestedModelSchema, {
              modelId: "upstream-model",
            }),
            action: create(ConversationActionSchema, {
              userMessageAction: create(UserMessageActionSchema, {
                userMessage: create(UserMessageSchema, { text: "hello" }),
              }),
            }),
          }),
        }),
      ),
    );
    const agentRunResponse = await fetch(
      `http://127.0.0.1:${portOf(bridge)}/agent.v1.AgentService/Run`,
      {
        method: "POST",
        headers: { "content-type": "application/connect+proto" },
        body: new Uint8Array(agentRunBody),
      },
    );

    expect(agentRunResponse.status).toBe(502);
    expect(await agentRunResponse.json()).toEqual({
      error: "agent run did not match local model",
    });
  });

  it("replays focused synthetic fixtures for owned interceptors", async () => {
    const { server: upstream, observed } = await startRecordingUpstream({
      responseBody: (request) =>
        (request.url ?? "").startsWith("/auth/")
          ? Buffer.from(
              JSON.stringify({
                nested: { agentUrl: "https://agent.api5.cursor.sh" },
                agentBackendUrlPrivacy: {
                  default: "https://agent.api5.cursor.sh",
                },
                agentBackendUrlNonPrivacy: {
                  default: "https://agentn.api5.cursor.sh",
                },
              }),
            )
          : toBinary(
              UploadIssueTraceResponseSchema,
              create(UploadIssueTraceResponseSchema),
            ),
    });
    const bridge = await startTestBridge({
      upstreamBaseUrl: `http://127.0.0.1:${portOf(upstream)}`,
    });

    const defaultModelResponse = await fetch(
      `http://127.0.0.1:${portOf(bridge)}/aiserver.v1.AiService/GetDefaultModel`,
      {
        method: "POST",
        headers: { "content-type": "application/proto" },
        body: new Uint8Array(
          toBinary(
            GetDefaultModelRequestSchema,
            create(GetDefaultModelRequestSchema),
          ),
        ),
      },
    );
    const defaultModel = fromBinary(
      GetDefaultModelResponseSchema,
      Buffer.from(await defaultModelResponse.arrayBuffer()),
    );

    expect(defaultModelResponse.status).toBe(200);
    expect(defaultModel.model).toBe("local-model");

    const authResponse = await fetch(
      `http://127.0.0.1:${portOf(bridge)}/auth/full_stripe_profile`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nested: { agentUrl: "https://agent.api5.cursor.sh" },
          agentBackendUrlPrivacy: { default: "https://agent.api5.cursor.sh" },
          agentBackendUrlNonPrivacy: {
            default: "https://agentn.api5.cursor.sh",
          },
        }),
      },
    );
    const authProfile = (await authResponse.json()) as {
      nested?: { agentUrl?: string };
      agentBackendUrlPrivacy?: { default?: string };
      agentBackendUrlNonPrivacy?: { default?: string };
    };
    const bridgeOrigin = `http://127.0.0.1:${portOf(bridge)}`;

    expect(authResponse.status).toBe(200);
    expect(authProfile.nested?.agentUrl).toBe(bridgeOrigin);
    expect(authProfile.agentBackendUrlPrivacy?.default).toBe(bridgeOrigin);
    expect(authProfile.agentBackendUrlNonPrivacy?.default).toBe(bridgeOrigin);

    const issueTraceRequest = toBinary(
      UploadIssueTraceRequestSchema,
      create(UploadIssueTraceRequestSchema, {
        payloadHash: "fixture-hash",
        payload: JSON.stringify({ message: "synthetic issue trace" }),
      }),
    );
    const issueTraceResponse = await fetch(
      `http://127.0.0.1:${portOf(bridge)}/aiserver.v1.AnalyticsService/UploadIssueTrace`,
      {
        method: "POST",
        headers: { "content-type": "application/connect+proto" },
        body: new Uint8Array(encodeEnvelope(issueTraceRequest)),
      },
    );
    const issueTraceBody = Buffer.from(await issueTraceResponse.arrayBuffer());

    expect(issueTraceResponse.status).toBe(209);
    expect(
      fromBinary(
        UploadIssueTraceResponseSchema,
        firstMessagePayload(issueTraceBody),
      ),
    ).toBeDefined();
    expect(observed.at(-1)?.path).toBe(
      "/aiserver.v1.AnalyticsService/UploadIssueTrace",
    );
    expect(observed.at(-1)?.body).toEqual(encodeEnvelope(issueTraceRequest));
  });
});

function interceptRoutesFromManifest(): RouteContractEntry[] {
  const manifest = JSON.parse(
    fs.readFileSync("docs/route-contract-manifest.json", "utf8"),
  ) as { routes: RouteContractEntry[] };
  return manifest.routes.filter((route) => route.policy === "intercept");
}

function fakeRequest(
  path: string,
  method: string,
  contentType: string,
): IncomingMessage {
  const headers: IncomingHttpHeaders =
    contentType === "none" ? {} : { "content-type": contentType };
  return {
    url: path,
    method,
    headers,
  } as IncomingMessage;
}

async function startRecordingUpstream(
  options: {
    responseBody?: Uint8Array | ((request: IncomingMessage) => Uint8Array);
  } = {},
) {
  const observed: ObservedRequest[] = [];
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const observedIndex =
        observed.push({
          method: request.method ?? "",
          path: new URL(request.url ?? "/", "http://localhost").pathname,
          contentType: firstHeaderValue(request.headers["content-type"]),
          body: Buffer.concat(chunks),
        }) - 1;
      response.writeHead(209, {
        "content-type": "application/connect+proto",
        "x-observed-index": String(observedIndex),
      });
      const responseBody =
        typeof options.responseBody === "function"
          ? options.responseBody(request)
          : options.responseBody;
      response.end(Buffer.from(responseBody ?? []));
    });
  });
  await listen(server);
  servers.push(server);
  return { server, observed };
}

async function startTestBridge(
  overrides: Partial<BridgeConfig> = {},
): Promise<http.Server> {
  const runtime = await createBridgeRuntime(
    { ...baseConfig(), ...overrides },
    createLogger(overrides.logLevel ?? "error"),
  );
  const server = await startServer(runtime);
  servers.push(server);
  return server;
}

function baseConfig(): BridgeConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    upstreamConnectHost: undefined,
    upstreamConnectPort: undefined,
    modelBaseUrl: "http://localhost:8080/v1",
    modelApiKey: "",
    modelName: "local-model",
    models: [
      {
        id: "local-model",
        displayName: "Local Model",
        providerModel: "local-model",
        baseUrl: "http://localhost:8080/v1",
        apiKey: "",
        contextTokenLimit: 128000,
        hardcodedResponse: "hello",
      },
    ],
    captureDir: "fixtures/captures",
    captureEnabled: false,
    desktopMode: false,
    failOpen: true,
    logLevel: "error",
    publicOrigin: undefined,
    agentPublicOrigin: undefined,
    desktopAgentHttpPort: undefined,
    routeInventoryEnabled: false,
    modelPayloadLogging: "summary",
    agentToolPolicy: "safe",
    agentNativeContextEnabled: true,
    tlsHostnames: ["localhost", "127.0.0.1", "::1"],
    unsafeAllowNonLocalhost: false,
    maxInterceptBodyBytes: 1024 * 1024,
    useTls: false,
  };
}

function firstHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function listen(server: http.Server): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function portOf(server: http.Server): number {
  const address = server.address() as AddressInfo;
  return address.port;
}
