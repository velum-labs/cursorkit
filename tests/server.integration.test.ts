import http from "node:http";
import type { AddressInfo } from "node:net";

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it } from "vitest";

import type { BridgeConfig } from "../src/config.js";
import {
  decodeEnvelopes,
  encodeEnvelope,
  firstMessagePayload,
  isEndStreamEnvelope,
} from "../src/connectEnvelope.js";
import {
  AgentV1_GetDefaultModelForCliRequestSchema,
  AgentV1_GetDefaultModelForCliResponseSchema,
  AgentV1_GetUsableModelsRequestSchema,
  AgentV1_GetUsableModelsResponseSchema,
  AgentV1_NameAgentRequestSchema,
  AgentV1_NameAgentResponseSchema,
  AgentUrlConfigSchema,
  BidiAppendRequestSchema,
  BidiAppendResponseSchema,
  BidiRequestIdSchema,
  GetServerConfigRequestSchema,
  GetServerConfigResponseSchema,
  Http2Config,
} from "../src/gen/aiserver/v1/aiserver_pb.js";
import {
  AgentClientMessageSchema,
  AgentRunRequestSchema,
  AgentServerMessageSchema,
  ConversationActionSchema,
  RequestedModelSchema,
  UserMessageActionSchema,
  UserMessageSchema,
} from "../src/gen/agent/v1/agent_pb.js";
import { createLogger } from "../src/logger.js";
import { decodeMessage, encodeMessage } from "../src/proto.js";
import { createBridgeRuntime, startServer } from "../src/server.js";

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
  servers.length = 0;
});

describe("bridge server", () => {
  it("passes unknown endpoints through without changing body bytes", async () => {
    let upstreamBody = Buffer.alloc(0);
    const upstream = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        upstreamBody = Buffer.concat(chunks);
        response.writeHead(201, {
          "content-type": "application/octet-stream",
          "x-upstream-path": request.url ?? "",
        });
        response.end(Buffer.from([9, 8, 7]));
      });
    });
    await listen(upstream);
    servers.push(upstream);

    const bridge = await startTestBridge({
      upstreamBaseUrl: `http://127.0.0.1:${portOf(upstream)}`,
    });

    const response = await fetch(
      `http://127.0.0.1:${portOf(bridge)}/unknown?x=1`,
      {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: new Uint8Array([0, 1, 2, 3]),
      },
    );

    expect(response.status).toBe(201);
    expect(upstreamBody).toEqual(Buffer.from([0, 1, 2, 3]));
    expect(response.headers.get("x-upstream-path")).toBe("/unknown?x=1");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      Buffer.from([9, 8, 7]),
    );
  });

  it("serves local models from the allowlisted AvailableModels route", async () => {
    const bridge = await startTestBridge();
    const runtime = await createBridgeRuntime(
      baseConfig(),
      createLogger("error"),
    );
    const requestBody = encodeEnvelope(
      encodeMessage(runtime.proto.AvailableModelsRequest, {}),
    );

    const response = await fetch(
      `http://127.0.0.1:${portOf(bridge)}/aiserver.v1.AiService/AvailableModels`,
      {
        method: "POST",
        headers: { "content-type": "application/connect+proto" },
        body: new Uint8Array(requestBody),
      },
    );
    const responseBody = Buffer.from(await response.arrayBuffer());
    const decoded = decodeMessage(
      runtime.proto.AvailableModelsResponse,
      firstMessagePayload(responseBody),
    ) as {
      modelNames: string[];
      models: Array<{
        name: string;
        supportsAgent?: boolean;
        namedModelSectionIndex?: number;
        parameterDefinitions?: Array<{
          id?: string;
          name?: string;
        }>;
        legacySlugs?: string[];
        idAliases?: string[];
        variants?: Array<{
          parameterValues?: Array<{
            id?: string;
            value?: string;
          }>;
          tooltipData?: unknown;
          displayNameOutsidePicker?: string;
          variantStringRepresentation?: string;
          legacySlug?: string;
        }>;
      }>;
    };
    const localModel = decoded.models.find(
      (model) => model.name === "local-model",
    );

    expect(response.status).toBe(200);
    expect(decoded.modelNames).toContain("local-model");
    expect(localModel?.supportsAgent).toBe(true);
    expect(localModel?.namedModelSectionIndex).toBe(1);
    expect(localModel?.parameterDefinitions).toEqual([
      expect.objectContaining({ id: "provider", name: "Provider" }),
    ]);
    expect(localModel?.legacySlugs).toContain("local-model");
    expect(localModel?.idAliases).toContain("local-model");
    expect(localModel?.variants).toHaveLength(1);
    expect(localModel?.variants?.[0]?.parameterValues).toEqual([
      expect.objectContaining({ id: "provider", value: "local" }),
    ]);
    expect(localModel?.variants?.[0]?.tooltipData).toBeDefined();
    expect(localModel?.variants?.[0]?.displayNameOutsidePicker).toBe(
      "Local Model",
    );
    expect(localModel?.variants?.[0]?.variantStringRepresentation).toBe(
      "local-model[provider=local]",
    );
    expect(localModel?.variants?.[0]?.legacySlug).toBe("local-model");
  });

  it("serves local models from Cursor Agent CLI model routes", async () => {
    const bridge = await startTestBridge();
    const usableModelsRequest = encodeEnvelope(
      toBinary(
        AgentV1_GetUsableModelsRequestSchema,
        create(AgentV1_GetUsableModelsRequestSchema),
      ),
    );

    const usableModelsResponse = await fetch(
      `http://127.0.0.1:${portOf(bridge)}/aiserver.v1.AiService/GetUsableModels`,
      {
        method: "POST",
        headers: { "content-type": "application/connect+proto" },
        body: new Uint8Array(usableModelsRequest),
      },
    );
    const usableModelsBody = Buffer.from(
      await usableModelsResponse.arrayBuffer(),
    );
    const usableModels = fromBinary(
      AgentV1_GetUsableModelsResponseSchema,
      firstMessagePayload(usableModelsBody),
    );

    const defaultModelRequest = encodeEnvelope(
      toBinary(
        AgentV1_GetDefaultModelForCliRequestSchema,
        create(AgentV1_GetDefaultModelForCliRequestSchema),
      ),
    );
    const defaultModelResponse = await fetch(
      `http://127.0.0.1:${portOf(bridge)}/aiserver.v1.AiService/GetDefaultModelForCli`,
      {
        method: "POST",
        headers: { "content-type": "application/connect+proto" },
        body: new Uint8Array(defaultModelRequest),
      },
    );
    const defaultModelBody = Buffer.from(
      await defaultModelResponse.arrayBuffer(),
    );
    const defaultModel = fromBinary(
      AgentV1_GetDefaultModelForCliResponseSchema,
      firstMessagePayload(defaultModelBody),
    );

    expect(usableModelsResponse.status).toBe(200);
    expect(usableModels.models.map((model) => model.modelId)).toContain(
      "local-model",
    );
    expect(
      usableModels.models.find((model) => model.modelId === "local-model")
        ?.apiKeyCredentials?.baseUrl,
    ).toBe("http://localhost:8080/v1");
    expect(defaultModelResponse.status).toBe(200);
    expect(defaultModel.model?.modelId).toBe("local-model");
    expect(defaultModel.model?.apiKeyCredentials?.baseUrl).toBe(
      "http://localhost:8080/v1",
    );
  });

  it("preserves raw application/proto framing for Cursor Agent CLI model routes", async () => {
    const bridge = await startTestBridge();
    const requestBody = toBinary(
      AgentV1_GetUsableModelsRequestSchema,
      create(AgentV1_GetUsableModelsRequestSchema),
    );

    const response = await fetch(
      `http://127.0.0.1:${portOf(bridge)}/aiserver.v1.AiService/GetUsableModels`,
      {
        method: "POST",
        headers: { "content-type": "application/proto" },
        body: new Uint8Array(requestBody),
      },
    );
    const responseBody = Buffer.from(await response.arrayBuffer());
    const decoded = fromBinary(
      AgentV1_GetUsableModelsResponseSchema,
      responseBody,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/proto");
    expect(decoded.models.map((model) => model.modelId)).toContain(
      "local-model",
    );
  });

  it("serves a local NameAgent fallback for raw Cursor Agent CLI requests", async () => {
    const bridge = await startTestBridge();
    const requestBody = toBinary(
      AgentV1_NameAgentRequestSchema,
      create(AgentV1_NameAgentRequestSchema, { userMessage: "hello" }),
    );

    const response = await fetch(
      `http://127.0.0.1:${portOf(bridge)}/aiserver.v1.AiService/NameAgent`,
      {
        method: "POST",
        headers: { "content-type": "application/proto" },
        body: new Uint8Array(requestBody),
      },
    );
    const responseBody = Buffer.from(await response.arrayBuffer());
    const decoded = fromBinary(AgentV1_NameAgentResponseSchema, responseBody);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/proto");
    expect(decoded.name).toBe("Local model chat");
  });

  it("rewrites server agent URLs to the bridge origin", async () => {
    const upstreamPayload = toBinary(
      GetServerConfigResponseSchema,
      create(GetServerConfigResponseSchema, {
        agentUrlConfig: create(AgentUrlConfigSchema, {
          agentUrl: "https://upstream-agent.example",
          agentnUrl: "https://upstream-agentn.example",
        }),
      }),
    );
    const upstream = http.createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/proto" });
      response.end(upstreamPayload);
    });
    await listen(upstream);
    servers.push(upstream);
    const bridge = await startTestBridge({
      upstreamBaseUrl: `http://127.0.0.1:${portOf(upstream)}`,
    });

    const response = await fetch(
      `http://127.0.0.1:${portOf(bridge)}/aiserver.v1.ServerConfigService/GetServerConfig`,
      {
        method: "POST",
        headers: { "content-type": "application/proto" },
        body: new Uint8Array(
          toBinary(
            GetServerConfigRequestSchema,
            create(GetServerConfigRequestSchema),
          ),
        ),
      },
    );
    const decoded = fromBinary(
      GetServerConfigResponseSchema,
      Buffer.from(await response.arrayBuffer()),
    );

    expect(response.status).toBe(200);
    expect(decoded.agentUrlConfig?.agentUrl).toBe(
      `http://127.0.0.1:${portOf(bridge)}`,
    );
    expect(decoded.agentUrlConfig?.agentnUrl).toBe(
      `http://127.0.0.1:${portOf(bridge)}`,
    );
    expect(decoded.http2Config).toBe(
      Http2Config.HTTP2_CONFIG_FORCE_ALL_DISABLED,
    );
  });

  it("streams local chat chunks for registered models", async () => {
    const bridge = await startTestBridge();
    const runtime = await createBridgeRuntime(
      baseConfig(),
      createLogger("error"),
    );
    const requestBody = encodeEnvelope(
      encodeMessage(runtime.proto.StreamUnifiedChatRequestWithTools, {
        streamUnifiedChatRequest: {
          modelDetails: { modelName: "local-model" },
          conversation: [{ text: "hello", type: 1 }],
          isChat: true,
        },
      }),
    );

    const response = await fetch(
      `http://127.0.0.1:${portOf(bridge)}/aiserver.v1.ChatService/StreamUnifiedChatWithTools`,
      {
        method: "POST",
        headers: { "content-type": "application/connect+proto" },
        body: new Uint8Array(requestBody),
      },
    );
    const responseBody = Buffer.from(await response.arrayBuffer());
    const messages = decodeEnvelopes(responseBody)
      .filter((envelope) => !isEndStreamEnvelope(envelope))
      .map((envelope) =>
        decodeMessage(
          runtime.proto.StreamUnifiedChatResponseWithTools,
          envelope.payload,
        ),
      );

    expect(response.status).toBe(200);
    expect(messages[0]).toMatchObject({
      streamUnifiedChatResponse: { text: "hello" },
    });
  });

  it("serves local Cursor Agent RunSSE requests from hex BidiAppend payloads", async () => {
    const bridge = await startTestBridge();
    const requestId = "local-agent-run";

    const runResponsePromise = fetch(
      `http://127.0.0.1:${portOf(bridge)}/agent.v1.AgentService/RunSSE`,
      {
        method: "POST",
        headers: { "content-type": "application/proto" },
        body: new Uint8Array(
          toBinary(
            BidiRequestIdSchema,
            create(BidiRequestIdSchema, { requestId }),
          ),
        ),
      },
    );

    const clientMessage = toBinary(
      AgentClientMessageSchema,
      create(AgentClientMessageSchema, {
        runRequest: create(AgentRunRequestSchema, {
          requestedModel: create(RequestedModelSchema, {
            modelId: "local-model",
          }),
          action: create(ConversationActionSchema, {
            userMessageAction: create(UserMessageActionSchema, {
              userMessage: create(UserMessageSchema, { text: "hello" }),
            }),
          }),
        }),
      }),
    );
    const appendResponse = await fetch(
      `http://127.0.0.1:${portOf(bridge)}/aiserver.v1.BidiService/BidiAppend`,
      {
        method: "POST",
        headers: { "content-type": "application/proto" },
        body: new Uint8Array(
          toBinary(
            BidiAppendRequestSchema,
            create(BidiAppendRequestSchema, {
              requestId: create(BidiRequestIdSchema, { requestId }),
              data: Buffer.from(clientMessage).toString("hex"),
            }),
          ),
        ),
      },
    );
    const appendBody = Buffer.from(await appendResponse.arrayBuffer());
    const runResponse = await runResponsePromise;
    const runBody = Buffer.from(await runResponse.arrayBuffer());
    const messages = decodeEnvelopes(runBody)
      .filter((envelope) => !isEndStreamEnvelope(envelope))
      .map((envelope) =>
        fromBinary(AgentServerMessageSchema, envelope.payload),
      );

    expect(appendResponse.status).toBe(200);
    expect(fromBinary(BidiAppendResponseSchema, appendBody)).toBeDefined();
    expect(runResponse.status).toBe(200);
    expect(messages[0]?.interactionUpdate?.textDelta?.text).toBe("hello");
    expect(messages.at(-1)?.interactionUpdate?.turnEnded).toBeDefined();
  });
});

async function startTestBridge(
  overrides: Partial<BridgeConfig> = {},
): Promise<http.Server> {
  const runtime = await createBridgeRuntime(
    { ...baseConfig(), ...overrides },
    createLogger("error"),
  );
  const server = await startServer(runtime);
  servers.push(server);
  return server;
}

function baseConfig(): BridgeConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    modelBaseUrl: "http://localhost:8080/v1",
    modelApiKey: "",
    modelName: "local-model",
    models: [
      {
        id: "local-model",
        displayName: "Local Model",
        baseUrl: "http://localhost:8080/v1",
        apiKey: "",
        contextTokenLimit: 128000,
        hardcodedResponse: "hello",
      },
    ],
    captureDir: "fixtures/captures",
    captureEnabled: false,
    failOpen: true,
    logLevel: "error",
    unsafeAllowNonLocalhost: false,
    maxInterceptBodyBytes: 1024 * 1024,
    useTls: false,
  };
}

async function listen(server: http.Server): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function portOf(server: http.Server): number {
  const address = server.address() as AddressInfo;
  return address.port;
}
