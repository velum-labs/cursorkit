import http from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import type { BridgeConfig } from "../src/config.js";
import {
  decodeEnvelopes,
  encodeEnvelope,
  firstMessagePayload,
  isEndStreamEnvelope,
} from "../src/connectEnvelope.js";
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
    );

    expect(response.status).toBe(200);
    expect(decoded.modelNames).toContain("local-model");
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
