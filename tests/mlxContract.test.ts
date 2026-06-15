import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import {
  OpenAICompatibleProvider,
  type OpenAICompletionEvent,
  type OpenAIStreamOptions,
} from "../src/providers/openai.js";
import { probeLocalBackend } from "../src/testing/localBackend.js";

const CURSOR_MODEL_ID = "local-qwen";
const DISPLAY_NAME = "Local Qwen";
const PROVIDER_MODEL = "mlx-community/Qwen3.5-4B-8bit";

const servers: http.Server[] = [];

afterEach(async () => {
  for (const server of servers) {
    server.closeAllConnections();
    await close(server);
  }
  servers.length = 0;
});

describe("MLX OpenAI-compatible backend contract", () => {
  it("probes /v1/models, chat completions, and streamed tool calls", async () => {
    const chatBodies: Array<Record<string, unknown>> = [];
    const server = http.createServer(async (request, response) => {
      if (request.method === "GET" && request.url === "/v1/models") {
        writeJson(response, {
          object: "list",
          data: [{ id: PROVIDER_MODEL, object: "model" }],
        });
        return;
      }
      if (request.method === "POST" && request.url === "/v1/chat/completions") {
        const body = await readJsonRequest<Record<string, unknown>>(request);
        chatBodies.push(body);
        if (Array.isArray(body.tools)) {
          writeSse(response, [
            toolCallChunk({
              id: "call-probe",
              name: "probe_tool",
              argumentsDelta: '{"value":',
            }),
            toolCallChunk({ argumentsDelta: '"ok"}' }),
            JSON.stringify({ choices: [{ finish_reason: "tool_calls" }] }),
          ]);
          return;
        }
        writeJson(response, {
          choices: [{ message: { role: "assistant", content: "ok" } }],
        });
        return;
      }
      response.writeHead(404);
      response.end();
    });
    const port = await listen(server);
    servers.push(server);

    const report = await probeLocalBackend({
      baseUrl: `http://127.0.0.1:${port}/v1`,
      model: PROVIDER_MODEL,
      apiKey: "local",
      timeoutMs: 1_000,
      checkToolCalls: true,
    });

    expect(report).toMatchObject({
      ok: true,
      modelsStatus: 200,
      chatStatus: 200,
      toolChatStatus: 200,
      models: [PROVIDER_MODEL],
      selectedModelFound: true,
      nonStreamingSupported: true,
      streamingSupported: false,
      toolCallsSupported: true,
      completionPreview: "ok",
    });
    expect(chatBodies.map((body) => body.model)).toEqual([
      PROVIDER_MODEL,
      PROVIDER_MODEL,
    ]);
  });

  it("uses providerModel for MLX while preserving Cursor-facing alias fields", async () => {
    const chatBodies: Array<Record<string, unknown>> = [];
    const server = http.createServer(async (request, response) => {
      request.on("error", () => undefined);
      const body = await readJsonRequest<Record<string, unknown>>(request);
      chatBodies.push(body);
      response.writeHead(200, { "content-type": "text/event-stream" });
      writeSplitUtf8Sse(response, "café");
      response.write(
        'data: {"choices":[],"usage":{"completion_tokens":1,"prompt_tokens":1,"total_tokens":2}}\n\n',
      );
      response.end("data: [DONE]\n\n");
    });
    const port = await listen(server);
    servers.push(server);
    const provider = createProvider(port);

    const text = await collectText(provider);

    expect(text).toBe("café");
    expect(chatBodies).toHaveLength(1);
    expect(chatBodies[0]).toMatchObject({
      model: PROVIDER_MODEL,
      messages: [{ role: "user", content: "hello" }],
      stream: true,
    });
  });

  it("accumulates split tool-call argument deltas", async () => {
    const server = http.createServer((request, response) => {
      request.resume();
      request.on("end", () => {
        writeSse(response, [
          toolCallChunk({
            id: "call-1",
            name: "read_file",
            argumentsDelta: '{"path":',
          }),
          toolCallChunk({ argumentsDelta: '"README' }),
          toolCallChunk({ argumentsDelta: '.md"}' }),
          JSON.stringify({ choices: [{ finish_reason: "tool_calls" }] }),
        ]);
      });
    });
    const port = await listen(server);
    servers.push(server);
    const provider = createProvider(port);

    const events = await collectEvents(provider);

    expect(events).toEqual([
      {
        type: "tool_calls",
        toolCalls: [
          {
            id: "call-1",
            type: "function",
            function: {
              name: "read_file",
              arguments: JSON.stringify({ path: "README.md" }),
            },
          },
        ],
      },
    ]);
  });

  it.each([404, 500])(
    "classifies backend HTTP %s as an error",
    async (status) => {
      const server = http.createServer((request, response) => {
        request.resume();
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: `status-${status}` }));
      });
      const port = await listen(server);
      servers.push(server);
      const provider = createProvider(port);

      await expect(collectText(provider)).rejects.toMatchObject({
        code: "http_error",
        message: expect.stringContaining(String(status)),
      });
    },
  );

  it("classifies malformed SSE data frames", async () => {
    const server = http.createServer((request, response) => {
      request.resume();
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end('data: {"choices":\n\n');
    });
    const port = await listen(server);
    servers.push(server);
    const provider = createProvider(port);

    await expect(collectText(provider)).rejects.toMatchObject({
      code: "malformed_sse",
      message: expect.stringContaining("malformed JSON"),
    });
  });

  it("aborts slow backend streams after the configured deadline", async () => {
    const server = http.createServer((request, response) => {
      request.resume();
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.flushHeaders();
    });
    const port = await listen(server);
    servers.push(server);
    const provider = createProvider(port, { requestTimeoutMs: 25 });

    await expect(collectText(provider)).rejects.toMatchObject({
      code: "request_timeout",
    });
  });

  it("honors caller abort signals during backend streams", async () => {
    const server = http.createServer((request, response) => {
      request.resume();
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.flushHeaders();
    });
    const port = await listen(server);
    servers.push(server);
    const provider = createProvider(port);
    const controller = new AbortController();
    const events = collectEvents(provider, { signal: controller.signal });

    setTimeout(() => controller.abort(), 10);

    await expect(events).rejects.toMatchObject({
      code: "request_aborted",
    });
  });

  it("reports model-not-found when /v1/models omits the provider model", async () => {
    const server = http.createServer((_request, response) => {
      writeJson(response, { data: [{ id: "other-model" }] });
    });
    const port = await listen(server);
    servers.push(server);

    const report = await probeLocalBackend({
      baseUrl: `http://127.0.0.1:${port}/v1`,
      model: PROVIDER_MODEL,
      apiKey: "",
      timeoutMs: 1_000,
    });

    expect(report).toMatchObject({
      ok: false,
      failureCode: "backend_unreachable",
      models: ["other-model"],
      selectedModelFound: false,
    });
    expect(report.message).toContain("was not returned");
  });
});

async function collectText(
  provider: OpenAICompatibleProvider,
): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of provider.streamCompletion([
    { role: "user", content: "hello" },
  ])) {
    chunks.push(chunk);
  }
  return chunks.join("");
}

async function collectEvents(
  provider: OpenAICompatibleProvider,
  options: OpenAIStreamOptions = {},
): Promise<OpenAICompletionEvent[]> {
  const events: OpenAICompletionEvent[] = [];
  for await (const event of provider.streamCompletionEvents(
    [{ role: "user", content: "hello" }],
    [
      {
        type: "function",
        function: {
          name: "read_file",
          description: "Read a file",
          parameters: { type: "object" },
        },
      },
    ],
    options,
  )) {
    events.push(event);
  }
  return events;
}

function createProvider(
  port: number,
  overrides: { requestTimeoutMs?: number } = {},
): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider({
    id: CURSOR_MODEL_ID,
    displayName: DISPLAY_NAME,
    providerModel: PROVIDER_MODEL,
    baseUrl: `http://127.0.0.1:${port}/v1`,
    apiKey: "",
    contextTokenLimit: 128_000,
    ...overrides,
  });
}

function writeJson(response: ServerResponse, body: unknown): void {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function writeSse(response: ServerResponse, jsonEvents: string[]): void {
  response.writeHead(200, { "content-type": "text/event-stream" });
  for (const json of jsonEvents) {
    response.write(`data: ${json}\n\n`);
  }
  response.end("data: [DONE]\n\n");
}

function writeSplitUtf8Sse(response: ServerResponse, content: string): void {
  const line = Buffer.from(
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
    "utf8",
  );
  const splitSseAt = 8;
  const splitUtf8At = line.indexOf(0xc3) + 1;
  response.write(line.subarray(0, splitSseAt));
  response.write(line.subarray(splitSseAt, splitUtf8At));
  response.write(line.subarray(splitUtf8At));
}

function toolCallChunk(options: {
  id?: string;
  name?: string;
  argumentsDelta: string;
}): string {
  return JSON.stringify({
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              ...(options.id === undefined ? {} : { id: options.id }),
              type: "function",
              function: {
                ...(options.name === undefined ? {} : { name: options.name }),
                arguments: options.argumentsDelta,
              },
            },
          ],
        },
      },
    ],
  });
}

async function readJsonRequest<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

async function close(server: http.Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
