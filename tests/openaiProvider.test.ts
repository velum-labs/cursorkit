import http from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import type { Logger } from "../src/logger.js";
import { OpenAICompatibleProvider } from "../src/providers/openai.js";

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
  servers.length = 0;
});

describe("OpenAICompatibleProvider observability", () => {
  it("logs outbound request and streamed response summaries", async () => {
    const capturedBodies: unknown[] = [];
    const server = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      request.on("end", () => {
        capturedBodies.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.write(
          'data: {"choices":[{"delta":{"content":"probe-ok"}}]}\n\n',
        );
        response.end("data: [DONE]\n\n");
      });
    });
    servers.push(server);
    const port = await listen(server);
    const logs: Array<{ message: string; metadata?: Record<string, unknown> }> =
      [];
    const logger: Logger = {
      debug: (message, metadata) => logs.push({ message, metadata }),
      info: (message, metadata) => logs.push({ message, metadata }),
      warn: (message, metadata) => logs.push({ message, metadata }),
      error: (message, metadata) => logs.push({ message, metadata }),
    };
    const provider = new OpenAICompatibleProvider(
      {
        id: "local-qwen",
        displayName: "local-qwen",
        providerModel: "mlx-community/Qwen3.5-4B-8bit",
        baseUrl: `http://127.0.0.1:${port}/v1`,
        apiKey: "local",
        contextTokenLimit: 128000,
      },
      logger,
      { logFullPayload: true },
    );

    const chunks: string[] = [];
    for await (const chunk of provider.streamCompletion([
      { role: "user", content: "hello from test" },
    ])) {
      chunks.push(chunk);
    }

    expect(chunks.join("")).toBe("probe-ok");
    expect(capturedBodies).toEqual([
      {
        model: "mlx-community/Qwen3.5-4B-8bit",
        messages: [{ role: "user", content: "hello from test" }],
        stream: true,
      },
    ]);
    expect(logs).toContainEqual(
      expect.objectContaining({
        message: "model backend request",
        metadata: expect.objectContaining({
          modelId: "local-qwen",
          providerModel: "mlx-community/Qwen3.5-4B-8bit",
          messageCount: 1,
          payload: expect.objectContaining({
            model: "mlx-community/Qwen3.5-4B-8bit",
          }),
        }),
      }),
    );
    expect(logs).toContainEqual(
      expect.objectContaining({
        message: "model backend response complete",
        metadata: expect.objectContaining({
          status: 200,
          chunkCount: 1,
          responseChars: 8,
        }),
      }),
    );
  });

  it("parses streamed OpenAI tool calls", async () => {
    const server = http.createServer((request, response) => {
      request.resume();
      request.on("end", () => {
        const toolChunk = {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call-1",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: "README.md" }),
                    },
                  },
                ],
              },
            },
          ],
        };
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(
          [
            `data: ${JSON.stringify(toolChunk)}`,
            'data: {"choices":[{"finish_reason":"tool_calls"}]}',
            "data: [DONE]",
            "",
          ].join("\n"),
        );
      });
    });
    servers.push(server);
    const port = await listen(server);
    const provider = new OpenAICompatibleProvider({
      id: "local-qwen",
      displayName: "local-qwen",
      providerModel: "mlx-community/Qwen3.5-4B-8bit",
      baseUrl: `http://127.0.0.1:${port}/v1`,
      apiKey: "",
      contextTokenLimit: 128000,
    });

    const events = [];
    for await (const event of provider.streamCompletionEvents(
      [{ role: "user", content: "read it" }],
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
    )) {
      events.push(event);
    }

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
});

async function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("expected TCP server address"));
        return;
      }
      resolve(address.port);
    });
  });
}
