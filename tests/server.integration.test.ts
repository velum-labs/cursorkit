import http from "node:http";
import https from "node:https";
import type { AddressInfo } from "node:net";

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it } from "vitest";

import type { BridgeConfig } from "../src/config.js";
import {
  decodeEnvelopes,
  encodeEnvelope,
  firstMessagePayload,
  isEndStreamEnvelope,
  parseEnvelopes,
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
  ConversationStateStructureSchema,
  ConversationTokenDetailsSchema,
  CursorRuleSchema,
  DeleteResultSchema,
  DeleteSuccessSchema,
  ExecClientMessageSchema,
  FetchResultSchema,
  FetchSuccessSchema,
  GrepContentMatchSchema,
  GrepContentResultSchema,
  GrepFileMatchSchema,
  GrepResultSchema,
  GrepSuccessSchema,
  GrepUnionResultSchema,
  LsDirectoryTreeNode_FileSchema,
  LsDirectoryTreeNodeSchema,
  LsResultSchema,
  LsSuccessSchema,
  McpToolDefinitionSchema,
  McpResultSchema,
  McpSuccessSchema,
  McpTextContentSchema,
  McpToolResultContentItemSchema,
  McpToolsSchema,
  PromptContextNodeSchema,
  PromptContextUsageTreeSchema,
  RequestedModelSchema,
  RequestContextResultSchema,
  RequestContextSchema,
  RequestContextSuccessSchema,
  ShellResultSchema,
  ShellSuccessSchema,
  WriteResultSchema,
  WriteSuccessSchema,
  ReadResultSchema,
  ReadSuccessSchema,
  SelectedContextSchema,
  SelectedFileSchema,
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
          isMaxMode?: boolean;
          isDefaultMaxConfig?: boolean;
          isDefaultNonMaxConfig?: boolean;
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
    expect(localModel?.parameterDefinitions ?? []).toEqual([
      expect.objectContaining({ id: "context", name: "Context" }),
      expect.objectContaining({ id: "reasoning", name: "Reasoning" }),
      expect.objectContaining({ id: "fast", name: "Fast" }),
    ]);
    expect(localModel?.legacySlugs).toContain("local-model");
    expect(localModel?.idAliases).toContain("local-model");
    expect(localModel?.variants).toHaveLength(2);
    expect(localModel?.variants?.[0]?.parameterValues ?? []).toEqual([
      expect.objectContaining({ id: "context", value: "272k" }),
      expect.objectContaining({ id: "reasoning", value: "medium" }),
      expect.objectContaining({ id: "fast", value: "false" }),
    ]);
    expect(localModel?.variants?.[0]?.tooltipData).toBeDefined();
    expect(localModel?.variants?.[0]?.displayNameOutsidePicker).toBe(
      "Local Model",
    );
    expect(localModel?.variants?.[0]?.variantStringRepresentation).toBe(
      "local-model[context=272k,reasoning=medium,fast=false]",
    );
    expect(localModel?.variants?.[0]?.legacySlug).toBe("local-model");
    expect(localModel?.variants?.[0]).toMatchObject({
      isDefaultNonMaxConfig: true,
    });
    expect(localModel?.variants?.[0]?.isMaxMode).not.toBe(true);
    expect(localModel?.variants?.[1]).toMatchObject({
      isMaxMode: true,
      isDefaultMaxConfig: true,
      variantStringRepresentation:
        "local-model[context=1m,reasoning=medium,fast=false]",
      legacySlug: "local-model",
    });
  });

  it("falls back to local models when upstream model payload decoding fails", async () => {
    const upstream = http.createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/proto" });
      response.end(Buffer.from([0, 0, 0, 0, 1, 255]));
    });
    await listen(upstream);
    servers.push(upstream);
    const bridge = await startTestBridge({
      upstreamBaseUrl: `http://127.0.0.1:${portOf(upstream)}`,
    });
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
    const decoded = decodeMessage(
      runtime.proto.AvailableModelsResponse,
      firstMessagePayload(Buffer.from(await response.arrayBuffer())),
    ) as { modelNames: string[] };

    expect(response.status).toBe(200);
    expect(decoded.modelNames).toContain("local-model");
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

  it("uses configured public origin for desktop server config rewrites", async () => {
    const upstreamPayload = toBinary(
      GetServerConfigResponseSchema,
      create(GetServerConfigResponseSchema),
    );
    const upstream = http.createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/proto" });
      response.end(upstreamPayload);
    });
    await listen(upstream);
    servers.push(upstream);
    const bridge = await startTestBridge({
      desktopMode: true,
      publicOrigin: "https://api2.cursor.sh",
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
    expect(decoded.agentUrlConfig?.agentUrl).toBe("https://api2.cursor.sh");
    expect(decoded.agentUrlConfig?.agentnUrl).toBe("https://api2.cursor.sh");
  });

  it("uses configured agent public origin for desktop agent URL rewrites", async () => {
    const upstreamPayload = toBinary(
      GetServerConfigResponseSchema,
      create(GetServerConfigResponseSchema),
    );
    const upstream = http.createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/proto" });
      response.end(upstreamPayload);
    });
    await listen(upstream);
    servers.push(upstream);
    const bridge = await startTestBridge({
      desktopMode: true,
      publicOrigin: "https://api2.cursor.sh",
      agentPublicOrigin: "http://127.0.0.1:9777",
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
    expect(decoded.agentUrlConfig?.agentUrl).toBe("http://127.0.0.1:9777");
    expect(decoded.agentUrlConfig?.agentnUrl).toBe("http://127.0.0.1:9777");
  });

  it("falls back to local server config when upstream config decoding fails", async () => {
    const upstream = http.createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/proto" });
      response.end(Buffer.from([0, 0, 0, 0, 1, 255]));
    });
    await listen(upstream);
    servers.push(upstream);
    const bridge = await startTestBridge({
      upstreamBaseUrl: `http://127.0.0.1:${portOf(upstream)}`,
      publicOrigin: "https://api2.cursor.sh",
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
    expect(decoded.agentUrlConfig?.agentUrl).toBe("https://api2.cursor.sh");
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

  it("serves local Cursor Agent Run requests from AgentClientMessage payloads", async () => {
    const bridge = await startTestBridge();
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

    const response = await fetch(
      `http://127.0.0.1:${portOf(bridge)}/agent.v1.AgentService/Run`,
      {
        method: "POST",
        headers: { "content-type": "application/connect+proto" },
        body: new Uint8Array(encodeEnvelope(clientMessage)),
      },
    );
    const responseBody = Buffer.from(await response.arrayBuffer());
    const messages = decodeEnvelopes(responseBody)
      .filter((envelope) => !isEndStreamEnvelope(envelope))
      .map((envelope) =>
        fromBinary(AgentServerMessageSchema, envelope.payload),
      );

    expect(response.status).toBe(200);
    expect(messages[0]?.interactionUpdate?.textDelta?.text).toBe("hello");
    expect(messages.at(-1)?.interactionUpdate?.turnEnded).toBeDefined();
  });

  it("injects Cursor agent context into local OpenAI-compatible requests", async () => {
    let capturedRequest: {
      messages?: Array<{ role: string; content: string }>;
    } = {};
    const backend = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        capturedRequest = JSON.parse(
          Buffer.concat(chunks).toString("utf8"),
        ) as typeof capturedRequest;
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(
          [
            'data: {"choices":[{"delta":{"content":"context-ok"}}]}',
            "data: [DONE]",
            "",
          ].join("\n"),
        );
      });
    });
    await listen(backend);
    servers.push(backend);
    const bridge = await startTestBridge({
      logLevel: "debug",
      models: [
        {
          id: "local-model",
          displayName: "Local Model",
          providerModel: "local-model",
          baseUrl: `http://127.0.0.1:${portOf(backend)}/v1`,
          apiKey: "",
          contextTokenLimit: 128000,
        },
      ],
    });
    const requestId = "local-agent-context-run";
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
          customSystemPrompt: "custom system prompt for local model",
          mcpTools: create(McpToolsSchema, {
            mcpTools: [
              create(McpToolDefinitionSchema, {
                name: "ReadFile",
                toolName: "read_file",
                providerIdentifier: "cursor",
                description: "Read files from the workspace",
              }),
            ],
          }),
          conversationState: create(ConversationStateStructureSchema, {
            tokenDetails: create(ConversationTokenDetailsSchema, {
              promptContextUsageTree: create(PromptContextUsageTreeSchema, {
                nodes: [
                  create(PromptContextNodeSchema, {
                    id: "node-1",
                    label: "Inline context",
                    kind: "file",
                    inlineContent: "inline repo context",
                  }),
                ],
              }),
            }),
          }),
          action: create(ConversationActionSchema, {
            userMessageAction: create(UserMessageActionSchema, {
              userMessage: create(UserMessageSchema, {
                text: "answer using context",
                selectedContext: create(SelectedContextSchema, {
                  files: [
                    create(SelectedFileSchema, {
                      path: "/repo/file.ts",
                      relativePath: "file.ts",
                      content: "export const fromSelectedFile = true;",
                    }),
                  ],
                }),
              }),
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
    const runResponse = await runResponsePromise;
    await runResponse.arrayBuffer();

    const allMessageText =
      capturedRequest.messages?.map((message) => message.content).join("\n") ??
      "";
    expect(appendResponse.status).toBe(200);
    expect(runResponse.status).toBe(200);
    expect(allMessageText).toContain("custom system prompt");
    expect(allMessageText).toContain("export const fromSelectedFile");
    expect(allMessageText).toContain("inline repo context");
    expect(allMessageText).toContain("ReadFile");
    expect(capturedRequest.messages?.at(-1)).toMatchObject({
      role: "user",
      content: "answer using context",
    });
  });

  it("requests native Cursor context before calling local model for desktop Agent Run", async () => {
    let capturedRequest: {
      messages?: Array<{ role: string; content: string }>;
    } = {};
    const backend = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        capturedRequest = JSON.parse(
          Buffer.concat(chunks).toString("utf8"),
        ) as typeof capturedRequest;
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(
          [
            'data: {"choices":[{"delta":{"content":"native-context-ok"}}]}',
            "data: [DONE]",
            "",
          ].join("\n"),
        );
      });
    });
    await listen(backend);
    servers.push(backend);
    const bridge = await startTestBridge({
      logLevel: "debug",
      models: [
        {
          id: "local-model",
          displayName: "Local Model",
          providerModel: "local-model",
          baseUrl: `http://127.0.0.1:${portOf(backend)}/v1`,
          apiKey: "",
          contextTokenLimit: 128000,
        },
      ],
    });

    const runRequest = toBinary(
      AgentClientMessageSchema,
      create(AgentClientMessageSchema, {
        runRequest: create(AgentRunRequestSchema, {
          requestedModel: create(RequestedModelSchema, {
            modelId: "local-model",
          }),
          action: create(ConversationActionSchema, {
            userMessageAction: create(UserMessageActionSchema, {
              userMessage: create(UserMessageSchema, {
                text: "what is this project?",
              }),
            }),
          }),
        }),
      }),
    );
    const contextResultMessage = toBinary(
      AgentClientMessageSchema,
      create(AgentClientMessageSchema, {
        execClientMessage: create(ExecClientMessageSchema, {
          id: 1,
          execId: "cursor-rpc-context-1",
          requestContextResult: create(RequestContextResultSchema, {
            success: create(RequestContextSuccessSchema, {
              requestContext: create(RequestContextSchema, {
                rules: [
                  create(CursorRuleSchema, {
                    fullPath: ".cursor/rules/project.mdc",
                    content: "Always explain that cursor-rpc is a bridge.",
                  }),
                ],
                tools: [
                  create(McpToolDefinitionSchema, {
                    name: "ReadFile",
                    toolName: "read_file",
                    providerIdentifier: "cursor",
                    description: "Read files from the workspace",
                  }),
                ],
                fileContents: {
                  "README.md": "# cursor-rpc\n\nLocal Cursor backend bridge.",
                },
                gitRepos: [],
                projectLayouts: [],
              }),
            }),
          }),
        }),
      }),
    );
    const modelResponse = await fetch(
      `http://127.0.0.1:${portOf(bridge)}/agent.v1.AgentService/Run`,
      {
        method: "POST",
        headers: {
          "content-type": "application/connect+proto",
          "x-cursor-rpc-native-agent": "true",
        },
        body: new Uint8Array(
          Buffer.concat([
            encodeEnvelope(runRequest),
            encodeEnvelope(contextResultMessage),
          ]),
        ),
      },
    );
    expect(modelResponse.status).toBe(200);
    const responseEnvelopes = decodeEnvelopes(
      Buffer.from(await modelResponse.arrayBuffer()),
    ).filter((envelope) => !isEndStreamEnvelope(envelope));
    const contextServerMessage = fromBinary(
      AgentServerMessageSchema,
      responseEnvelopes[0]?.payload ?? new Uint8Array(),
    );
    expect(
      contextServerMessage.execServerMessage?.requestContextArgs,
    ).toBeDefined();
    const allMessageText =
      capturedRequest.messages?.map((message) => message.content).join("\n") ??
      "";
    expect(allMessageText).toContain("Cursor native request context");
    expect(allMessageText).toContain("cursor-rpc");
    expect(allMessageText).toContain("ReadFile");
    expect(allMessageText).toContain("Always explain");
    expect(capturedRequest.messages?.at(-1)).toMatchObject({
      role: "user",
      content: "what is this project?",
    });
  });

  it("executes local model read_file tool calls through Cursor Agent Run", async () => {
    const capturedRequests: Array<{
      messages?: Array<{
        role: string;
        content: string;
        tool_call_id?: string;
      }>;
      tools?: Array<{ function?: { name?: string } }>;
    }> = [];
    const backend = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        let parsed: {
          messages?: Array<{
            role: string;
            content: string;
            tool_call_id?: string;
          }>;
          tools?: Array<{ function?: { name?: string } }>;
        };
        try {
          parsed = JSON.parse(
            Buffer.concat(chunks).toString("utf8"),
          ) as typeof parsed;
        } catch (error) {
          response.writeHead(500, { "content-type": "text/plain" });
          response.end(error instanceof Error ? error.message : String(error));
          return;
        }
        capturedRequests.push(parsed);
        response.writeHead(200, { "content-type": "text/event-stream" });
        if (capturedRequests.length <= 3) {
          const toolCalls = [
            {
              id: "call-readme",
              name: "read_file",
              arguments: { path: "README.md" },
            },
            {
              id: "call-list",
              name: "list_dir",
              arguments: { path: "." },
            },
            {
              id: "call-grep",
              name: "grep",
              arguments: { pattern: "bridge", path: ".", head_limit: 5 },
            },
          ];
          const selected = toolCalls[capturedRequests.length - 1]!;
          const toolCallChunk = {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: selected.id,
                      type: "function",
                      function: {
                        name: selected.name,
                        arguments: JSON.stringify(selected.arguments),
                      },
                    },
                  ],
                },
              },
            ],
          };
          response.end(
            [
              `data: ${JSON.stringify(toolCallChunk)}`,
              'data: {"choices":[{"finish_reason":"tool_calls"}]}',
              "data: [DONE]",
              "",
            ].join("\n"),
          );
          return;
        }
        response.end(
          [
            'data: {"choices":[{"delta":{"content":"readme-ok"}}]}',
            "data: [DONE]",
            "",
          ].join("\n"),
        );
      });
    });
    await listen(backend);
    servers.push(backend);
    const bridge = await startTestBridge({
      logLevel: "debug",
      models: [
        {
          id: "local-model",
          displayName: "Local Model",
          providerModel: "local-model",
          baseUrl: `http://127.0.0.1:${portOf(backend)}/v1`,
          apiKey: "",
          contextTokenLimit: 128000,
        },
      ],
    });

    const runRequest = toBinary(
      AgentClientMessageSchema,
      create(AgentClientMessageSchema, {
        runRequest: create(AgentRunRequestSchema, {
          requestedModel: create(RequestedModelSchema, {
            modelId: "local-model",
          }),
          action: create(ConversationActionSchema, {
            userMessageAction: create(UserMessageActionSchema, {
              userMessage: create(UserMessageSchema, {
                text: "read the readme",
              }),
            }),
          }),
        }),
      }),
    );
    const contextResultMessage = toBinary(
      AgentClientMessageSchema,
      create(AgentClientMessageSchema, {
        execClientMessage: create(ExecClientMessageSchema, {
          id: 1,
          execId: "cursor-rpc-context-1",
          requestContextResult: create(RequestContextResultSchema, {
            success: create(RequestContextSuccessSchema, {
              requestContext: create(RequestContextSchema, {
                tools: [
                  create(McpToolDefinitionSchema, {
                    name: "ReadFile",
                    toolName: "read_file",
                    providerIdentifier: "cursor",
                    description: "Read files from the workspace",
                  }),
                ],
              }),
            }),
          }),
        }),
      }),
    );
    const readResultMessage = toBinary(
      AgentClientMessageSchema,
      create(AgentClientMessageSchema, {
        execClientMessage: create(ExecClientMessageSchema, {
          id: 2,
          execId: "cursor-rpc-tool-call-readme",
          readResult: create(ReadResultSchema, {
            success: create(ReadSuccessSchema, {
              path: "README.md",
              content:
                "# cursor-rpc\n\nThis project bridges Cursor to local models.",
              totalLines: 3,
              fileSize: BigInt(57),
              truncated: false,
              rangeApplied: false,
            }),
          }),
        }),
      }),
    );
    const lsResultMessage = toBinary(
      AgentClientMessageSchema,
      create(AgentClientMessageSchema, {
        execClientMessage: create(ExecClientMessageSchema, {
          id: 3,
          execId: "cursor-rpc-tool-call-list",
          lsResult: create(LsResultSchema, {
            success: create(LsSuccessSchema, {
              directoryTreeRoot: create(LsDirectoryTreeNodeSchema, {
                absPath: "/repo",
                childrenFiles: [
                  create(LsDirectoryTreeNode_FileSchema, { name: "README.md" }),
                  create(LsDirectoryTreeNode_FileSchema, {
                    name: "package.json",
                  }),
                ],
                childrenWereProcessed: true,
                fullSubtreeExtensionCounts: { ".md": 1, ".json": 1 },
                numFiles: 2,
              }),
            }),
          }),
        }),
      }),
    );
    const grepResultMessage = toBinary(
      AgentClientMessageSchema,
      create(AgentClientMessageSchema, {
        execClientMessage: create(ExecClientMessageSchema, {
          id: 4,
          execId: "cursor-rpc-tool-call-grep",
          grepResult: create(GrepResultSchema, {
            success: create(GrepSuccessSchema, {
              pattern: "bridge",
              path: ".",
              outputMode: "content",
              workspaceResults: {
                workspace: create(GrepUnionResultSchema, {
                  content: create(GrepContentResultSchema, {
                    matches: [
                      create(GrepFileMatchSchema, {
                        file: "README.md",
                        matches: [
                          create(GrepContentMatchSchema, {
                            lineNumber: 3,
                            content:
                              "This project bridges Cursor to local models.",
                            contentTruncated: false,
                            isContextLine: false,
                          }),
                        ],
                      }),
                    ],
                    totalLines: 1,
                    totalMatchedLines: 1,
                    clientTruncated: false,
                    ripgrepTruncated: false,
                  }),
                }),
              },
            }),
          }),
        }),
      }),
    );

    const { responseText, serverMessages } = await runDuplexAgentRequest(
      portOf(bridge),
      runRequest,
      contextResultMessage,
      [readResultMessage, lsResultMessage, grepResultMessage],
    );

    expect(capturedRequests).toHaveLength(4);
    const firstRequest = capturedRequests[0];
    expect(firstRequest?.tools?.map((tool) => tool.function?.name)).toEqual([
      "read_file",
      "list_dir",
      "grep",
      "fetch_url",
    ]);
    expect(firstRequest?.tools?.[0]).toMatchObject({
      function: {
        name: "read_file",
        parameters: expect.objectContaining({
          type: "object",
          required: ["path"],
          additionalProperties: false,
        }),
      },
    });
    const readExec = serverMessages.find(
      (message) => message.execServerMessage?.readArgs !== undefined,
    )?.execServerMessage?.readArgs;
    expect(readExec).toMatchObject({
      path: "README.md",
      toolCallId: "call-readme",
    });
    const lsExec = serverMessages.find(
      (message) => message.execServerMessage?.lsArgs !== undefined,
    )?.execServerMessage?.lsArgs;
    expect(lsExec).toMatchObject({
      path: ".",
      toolCallId: "call-list",
    });
    const grepExec = serverMessages.find(
      (message) => message.execServerMessage?.grepArgs !== undefined,
    )?.execServerMessage?.grepArgs;
    expect(grepExec).toMatchObject({
      pattern: "bridge",
      path: ".",
      headLimit: 5,
      toolCallId: "call-grep",
    });
    const secondMessages = capturedRequests[1]?.messages ?? [];
    expect(secondMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "assistant",
          tool_calls: [
            expect.objectContaining({
              id: "call-readme",
              type: "function",
              function: expect.objectContaining({
                name: "read_file",
                arguments: JSON.stringify({ path: "README.md" }),
              }),
            }),
          ],
        }),
      ]),
    );
    const finalMessages = capturedRequests[3]?.messages ?? [];
    expect(finalMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "tool",
          tool_call_id: "call-readme",
          content: expect.stringContaining("bridges Cursor"),
        }),
        expect.objectContaining({
          role: "tool",
          tool_call_id: "call-list",
          content: expect.stringContaining("README.md"),
        }),
        expect.objectContaining({
          role: "tool",
          tool_call_id: "call-grep",
          content: expect.stringContaining("bridges Cursor"),
        }),
      ]),
    );
    expect(responseText).toContain("readme-ok");
  });

  it("maps extended Cursor tool calls through Agent Run", async () => {
    const cases = [
      {
        toolName: "run_shell",
        args: { command: "echo hello", working_directory: "/repo" },
        result: create(AgentClientMessageSchema, {
          execClientMessage: create(ExecClientMessageSchema, {
            id: 2,
            execId: "cursor-rpc-tool-call-run_shell",
            shellResult: create(ShellResultSchema, {
              success: create(ShellSuccessSchema, {
                command: "echo hello",
                workingDirectory: "/repo",
                exitCode: 0,
                signal: "",
                stdout: "hello\n",
                stderr: "",
                executionTime: 1,
              }),
            }),
          }),
        }),
        assertExec: (
          message: ReturnType<
            typeof fromBinary<typeof AgentServerMessageSchema>
          >,
        ) =>
          expect(message.execServerMessage?.shellArgs).toMatchObject({
            command: "echo hello",
            workingDirectory: "/repo",
            toolCallId: "call-run_shell",
          }),
        resultText: "hello",
      },
      {
        toolName: "write_file",
        args: { path: "out.txt", content: "hello" },
        result: create(AgentClientMessageSchema, {
          execClientMessage: create(ExecClientMessageSchema, {
            id: 2,
            execId: "cursor-rpc-tool-call-write_file",
            writeResult: create(WriteResultSchema, {
              success: create(WriteSuccessSchema, {
                path: "out.txt",
                linesCreated: 1,
                fileSize: 5,
                fileContentAfterWrite: "hello",
              }),
            }),
          }),
        }),
        assertExec: (
          message: ReturnType<
            typeof fromBinary<typeof AgentServerMessageSchema>
          >,
        ) =>
          expect(message.execServerMessage?.writeArgs).toMatchObject({
            path: "out.txt",
            fileText: "hello",
            toolCallId: "call-write_file",
            returnFileContentAfterWrite: true,
          }),
        resultText: "out.txt",
      },
      {
        toolName: "delete_path",
        args: { path: "old.txt" },
        result: create(AgentClientMessageSchema, {
          execClientMessage: create(ExecClientMessageSchema, {
            id: 2,
            execId: "cursor-rpc-tool-call-delete_path",
            deleteResult: create(DeleteResultSchema, {
              success: create(DeleteSuccessSchema, {
                path: "old.txt",
                deletedFile: "old.txt",
                fileSize: BigInt(3),
                prevContent: "old",
              }),
            }),
          }),
        }),
        assertExec: (
          message: ReturnType<
            typeof fromBinary<typeof AgentServerMessageSchema>
          >,
        ) =>
          expect(message.execServerMessage?.deleteArgs).toMatchObject({
            path: "old.txt",
            toolCallId: "call-delete_path",
          }),
        resultText: "old.txt",
      },
      {
        toolName: "fetch_url",
        args: { url: "https://example.com" },
        result: create(AgentClientMessageSchema, {
          execClientMessage: create(ExecClientMessageSchema, {
            id: 2,
            execId: "cursor-rpc-tool-call-fetch_url",
            fetchResult: create(FetchResultSchema, {
              success: create(FetchSuccessSchema, {
                url: "https://example.com",
                content: "Example Domain",
                statusCode: 200,
                contentType: "text/html",
              }),
            }),
          }),
        }),
        assertExec: (
          message: ReturnType<
            typeof fromBinary<typeof AgentServerMessageSchema>
          >,
        ) =>
          expect(message.execServerMessage?.fetchArgs).toMatchObject({
            url: "https://example.com",
            toolCallId: "call-fetch_url",
          }),
        resultText: "Example Domain",
      },
      {
        toolName: "mcp_tool",
        args: {
          provider_identifier: "cursor",
          tool_name: "sample_tool",
          arguments: { query: "hello" },
        },
        result: create(AgentClientMessageSchema, {
          execClientMessage: create(ExecClientMessageSchema, {
            id: 2,
            execId: "cursor-rpc-tool-call-mcp_tool",
            mcpResult: create(McpResultSchema, {
              success: create(McpSuccessSchema, {
                content: [
                  create(McpToolResultContentItemSchema, {
                    text: create(McpTextContentSchema, {
                      text: "mcp result",
                    }),
                  }),
                ],
                isError: false,
              }),
            }),
          }),
        }),
        assertExec: (
          message: ReturnType<
            typeof fromBinary<typeof AgentServerMessageSchema>
          >,
        ) => {
          expect(message.execServerMessage?.mcpArgs).toMatchObject({
            providerIdentifier: "cursor",
            toolName: "sample_tool",
            toolCallId: "call-mcp_tool",
          });
          expect(
            message.execServerMessage?.mcpArgs?.args.query?.stringValue,
          ).toBe("hello");
        },
        resultText: "mcp result",
      },
    ];

    for (const testCase of cases) {
      const capturedRequests: Array<{
        messages?: Array<{
          role: string;
          content: string;
          tool_call_id?: string;
        }>;
      }> = [];
      const backend = http.createServer((request, response) => {
        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("end", () => {
          capturedRequests.push(
            JSON.parse(
              Buffer.concat(chunks).toString("utf8"),
            ) as (typeof capturedRequests)[number],
          );
          response.writeHead(200, { "content-type": "text/event-stream" });
          if (capturedRequests.length === 1) {
            response.end(
              scriptedToolCallSse(
                `call-${testCase.toolName}`,
                testCase.toolName,
                testCase.args,
              ),
            );
            return;
          }
          response.end(
            [
              `data: ${JSON.stringify({
                choices: [{ delta: { content: `${testCase.toolName}-ok` } }],
              })}`,
              "data: [DONE]",
              "",
            ].join("\n"),
          );
        });
      });
      await listen(backend);
      servers.push(backend);
      const bridge = await startTestBridge({
        agentToolPolicy: "all",
        models: [
          {
            id: "local-model",
            displayName: "Local Model",
            providerModel: "local-model",
            baseUrl: `http://127.0.0.1:${portOf(backend)}/v1`,
            apiKey: "",
            contextTokenLimit: 128000,
          },
        ],
      });
      const runRequest = toBinary(
        AgentClientMessageSchema,
        create(AgentClientMessageSchema, {
          runRequest: create(AgentRunRequestSchema, {
            requestedModel: create(RequestedModelSchema, {
              modelId: "local-model",
            }),
            action: create(ConversationActionSchema, {
              userMessageAction: create(UserMessageActionSchema, {
                userMessage: create(UserMessageSchema, {
                  text: `use ${testCase.toolName}`,
                }),
              }),
            }),
          }),
        }),
      );
      const contextResultMessage = toBinary(
        AgentClientMessageSchema,
        create(AgentClientMessageSchema, {
          execClientMessage: create(ExecClientMessageSchema, {
            id: 1,
            execId: "cursor-rpc-context-1",
            requestContextResult: create(RequestContextResultSchema, {
              success: create(RequestContextSuccessSchema, {
                requestContext: create(RequestContextSchema),
              }),
            }),
          }),
        }),
      );
      const { responseText, serverMessages } = await runDuplexAgentRequest(
        portOf(bridge),
        runRequest,
        contextResultMessage,
        [toBinary(AgentClientMessageSchema, testCase.result)],
      );
      const execMessage = serverMessages.find(
        (message) =>
          message.execServerMessage !== undefined &&
          message.execServerMessage.requestContextArgs === undefined,
      );
      expect(execMessage).toBeDefined();
      testCase.assertExec(execMessage!);
      expect(capturedRequests[1]?.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: "tool",
            tool_call_id: `call-${testCase.toolName}`,
            content: expect.stringContaining(testCase.resultText),
          }),
        ]),
      );
      expect(responseText).toContain(`${testCase.toolName}-ok`);
    }
  }, 30_000);

  it("serves typed local model and chat routes over HTTPS", async () => {
    const bridge = await startTestBridge({ useTls: true });
    const runtime = await createBridgeRuntime(
      baseConfig(),
      createLogger("error"),
    );
    const modelRequestBody = encodeEnvelope(
      encodeMessage(runtime.proto.AvailableModelsRequest, {}),
    );

    const modelsResponse = await httpsRequestBuffer(portOf(bridge), {
      path: "/aiserver.v1.AiService/AvailableModels",
      method: "POST",
      headers: { "content-type": "application/connect+proto" },
      body: modelRequestBody,
    });
    const decoded = decodeMessage(
      runtime.proto.AvailableModelsResponse,
      firstMessagePayload(modelsResponse.body),
    ) as { modelNames: string[] };
    const chatRequestBody = encodeEnvelope(
      encodeMessage(runtime.proto.StreamUnifiedChatRequestWithTools, {
        streamUnifiedChatRequest: {
          modelDetails: { modelName: "local-model" },
          conversation: [{ text: "hello", type: 1 }],
          isChat: true,
        },
      }),
    );
    const chatResponse = await httpsRequestBuffer(portOf(bridge), {
      path: "/aiserver.v1.ChatService/StreamUnifiedChatWithTools",
      method: "POST",
      headers: { "content-type": "application/connect+proto" },
      body: chatRequestBody,
    });
    const messages = decodeEnvelopes(chatResponse.body)
      .filter((envelope) => !isEndStreamEnvelope(envelope))
      .map((envelope) =>
        decodeMessage(
          runtime.proto.StreamUnifiedChatResponseWithTools,
          envelope.payload,
        ),
      );

    expect(modelsResponse.status).toBe(200);
    expect(decoded.modelNames).toContain("local-model");
    expect(chatResponse.status).toBe(200);
    expect(messages[0]).toMatchObject({
      streamUnifiedChatResponse: { text: "hello" },
    });
  });
});

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
    tlsHostnames: ["localhost", "127.0.0.1", "::1"],
    unsafeAllowNonLocalhost: false,
    maxInterceptBodyBytes: 1024 * 1024,
    useTls: false,
  };
}

async function httpsRequestBuffer(
  port: number,
  options: {
    path: string;
    method: string;
    headers: Record<string, string>;
    body: Buffer;
  },
): Promise<{ status: number; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: "127.0.0.1",
        port,
        path: options.path,
        method: options.method,
        headers: options.headers,
        rejectUnauthorized: false,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    request.on("error", reject);
    request.end(options.body);
  });
}

async function runDuplexAgentRequest(
  port: number,
  runRequest: Uint8Array,
  contextResultMessage: Uint8Array,
  toolResultMessages: Uint8Array[],
): Promise<{
  responseText: string;
  serverMessages: Array<
    ReturnType<typeof fromBinary<typeof AgentServerMessageSchema>>
  >;
}> {
  return await new Promise((resolve, reject) => {
    let responseText = "";
    let responseBuffer = Buffer.alloc(0);
    const serverMessages: Array<
      ReturnType<typeof fromBinary<typeof AgentServerMessageSchema>>
    > = [];
    let contextSent = false;
    let toolResultIndex = 0;
    const request = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/agent.v1.AgentService/Run",
        method: "POST",
        headers: {
          "content-type": "application/connect+proto",
          "x-cursor-rpc-native-agent": "true",
        },
      },
      (response) => {
        response.on("data", (chunk: Buffer) => {
          responseBuffer = Buffer.concat([
            responseBuffer,
            Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
          ]);
          const parsed = parseEnvelopes(responseBuffer);
          responseBuffer = Buffer.from(parsed.remainder);
          for (const envelope of parsed.envelopes) {
            if (isEndStreamEnvelope(envelope)) {
              continue;
            }
            const message = fromBinary(
              AgentServerMessageSchema,
              envelope.payload,
            );
            serverMessages.push(message);
            if (
              message.execServerMessage?.requestContextArgs !== undefined &&
              !contextSent
            ) {
              contextSent = true;
              request.write(encodeEnvelope(contextResultMessage));
              continue;
            }
            if (
              isToolExecServerMessage(message) &&
              toolResultIndex < toolResultMessages.length
            ) {
              request.write(
                encodeEnvelope(toolResultMessages[toolResultIndex]!),
              );
              toolResultIndex += 1;
              if (toolResultIndex === toolResultMessages.length) {
                request.end();
              }
              continue;
            }
            responseText += message.interactionUpdate?.textDelta?.text ?? "";
          }
        });
        response.on("end", () => {
          if ((response.statusCode ?? 0) >= 400) {
            reject(new Error(`Agent Run returned HTTP ${response.statusCode}`));
            return;
          }
          resolve({ responseText, serverMessages });
        });
      },
    );
    request.on("error", reject);
    request.write(encodeEnvelope(runRequest));
  });
}

function isToolExecServerMessage(
  message: ReturnType<typeof fromBinary<typeof AgentServerMessageSchema>>,
): boolean {
  const exec = message.execServerMessage;
  return (
    exec?.readArgs !== undefined ||
    exec?.lsArgs !== undefined ||
    exec?.grepArgs !== undefined ||
    exec?.shellArgs !== undefined ||
    exec?.writeArgs !== undefined ||
    exec?.deleteArgs !== undefined ||
    exec?.fetchArgs !== undefined ||
    exec?.mcpArgs !== undefined
  );
}

function scriptedToolCallSse(
  id: string,
  name: string,
  args: Record<string, unknown>,
): string {
  return [
    `data: ${JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: {
                  name,
                  arguments: JSON.stringify(args),
                },
              },
            ],
          },
        },
      ],
    })}`,
    'data: {"choices":[{"finish_reason":"tool_calls"}]}',
    "data: [DONE]",
    "",
  ].join("\n");
}

async function listen(server: http.Server): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function portOf(server: http.Server): number {
  const address = server.address() as AddressInfo;
  return address.port;
}
