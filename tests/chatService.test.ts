import type { ServerResponse } from "node:http";

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";

import {
  decodeEnvelopes,
  isEndStreamEnvelope,
} from "../src/connectEnvelope.js";
import {
  ConversationMessageSchema,
  StreamUnifiedChatRequestSchema,
  StreamUnifiedChatRequestWithToolsSchema,
  StreamUnifiedChatResponseWithToolsSchema,
} from "../src/gen/aiserver/v1/aiserver_pb.js";
import { createLogger } from "../src/logger.js";
import type { RegisteredModel } from "../src/models/registry.js";
import {
  OpenAIBackendError,
  type OpenAIStreamOptions,
} from "../src/providers/openai.js";
import { writeLocalChatResponse } from "../src/services/chat.js";

interface CapturedResponse {
  response: ServerResponse;
  chunks: () => Buffer;
}

function createCapturingResponse(): CapturedResponse {
  const buffers: Buffer[] = [];
  const headers = new Map<string, string>();
  const fake = {
    statusCode: 0,
    headersSent: false,
    setHeader(name: string, value: string): void {
      headers.set(name.toLowerCase(), value);
    },
    write(chunk: Buffer | string): boolean {
      this.headersSent = true;
      buffers.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return true;
    },
    end(chunk?: Buffer | string): void {
      this.headersSent = true;
      if (chunk !== undefined) {
        buffers.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
    },
  };
  return {
    response: fake as unknown as ServerResponse,
    chunks: () => Buffer.concat(buffers),
  };
}

function failingModel(error: unknown): RegisteredModel {
  return {
    id: "local-model",
    displayName: "Local Model",
    baseUrl: "http://localhost:8080/v1",
    apiKey: "",
    contextTokenLimit: 128000,
    provider: {
      name: "test-throwing-provider",
      async *streamCompletion(
        _messages,
        _options?: OpenAIStreamOptions,
      ): AsyncGenerator<string> {
        throw error;
      },
    },
  };
}

function chatRequest() {
  return create(StreamUnifiedChatRequestWithToolsSchema, {
    streamUnifiedChatRequest: create(StreamUnifiedChatRequestSchema, {
      modelDetails: { modelName: "local-model" },
      conversation: [create(ConversationMessageSchema, { text: "hello" })],
      isChat: true,
    }),
  });
}

interface DecodedFailure {
  texts: string[];
  endStreamError: string | undefined;
}

function decodeFailure(body: Buffer): DecodedFailure {
  const envelopes = decodeEnvelopes(body);
  const texts: string[] = [];
  let endStreamError: string | undefined;
  for (const envelope of envelopes) {
    if (isEndStreamEnvelope(envelope)) {
      const parsed = JSON.parse(
        Buffer.from(envelope.payload).toString("utf8"),
      ) as {
        metadata?: { error?: string };
      };
      endStreamError = parsed.metadata?.error;
      continue;
    }
    const message = fromBinary(
      StreamUnifiedChatResponseWithToolsSchema,
      envelope.payload,
    );
    const text = message.streamUnifiedChatResponse?.text;
    if (text !== undefined && text.length > 0) {
      texts.push(text);
    }
  }
  return { texts, endStreamError };
}

async function runFailure(error: unknown): Promise<DecodedFailure> {
  const captured = createCapturingResponse();
  await writeLocalChatResponse(
    captured.response,
    { model: failingModel(error), request: chatRequest() },
    createLogger("error"),
  );
  return decodeFailure(captured.chunks());
}

describe("writeLocalChatResponse failure handling", () => {
  it("emits a credit/quota notice when the upstream is out of quota", async () => {
    const error = new OpenAIBackendError(
      "http_error",
      "Model backend returned 429: insufficient_quota",
      { category: "quota_exhausted", status: 429 },
    );

    const { texts, endStreamError } = await runFailure(error);

    const notice = texts.join("");
    expect(notice).toContain("out of credits");
    expect(notice).toContain("fusion ensemble");
    expect(endStreamError).toBe("model out of credits / quota");
  });

  it("emits a rate-limit notice with the Retry-After hint for transient failures", async () => {
    const error = new OpenAIBackendError(
      "http_error",
      "Model backend returned 429",
      {
        category: "transient",
        status: 429,
        retryAfter: 12,
      },
    );

    const { texts, endStreamError } = await runFailure(error);

    const notice = texts.join("");
    expect(notice).toContain("rate-limited");
    expect(notice).toContain("~12s");
    expect(endStreamError).toBe(
      "model rate-limited or temporarily unavailable",
    );
  });

  it("keeps the opaque failure for unknown errors without a user notice", async () => {
    const { texts, endStreamError } = await runFailure(new Error("boom"));

    expect(texts).toHaveLength(0);
    expect(endStreamError).toBe("local model failed");
  });

  it("does not emit a chat notice for permanent auth errors", async () => {
    const error = new OpenAIBackendError(
      "http_error",
      "Model backend returned 401",
      {
        category: "auth_permanent",
        status: 401,
      },
    );

    const { texts, endStreamError } = await runFailure(error);

    expect(texts).toHaveLength(0);
    expect(endStreamError).toBe("model auth or permission error");
  });
});
