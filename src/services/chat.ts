import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";

import { encodeEndStream, encodeEnvelope } from "../connectEnvelope.js";
import {
  StreamUnifiedChatRequestWithToolsSchema,
  StreamUnifiedChatResponseSchema,
  StreamUnifiedChatResponseWithToolsSchema,
  type StreamUnifiedChatRequestWithTools,
} from "../gen/aiserver/v1/aiserver_pb.js";
import type { Logger } from "../logger.js";
import type { ModelRegistry, RegisteredModel } from "../models/registry.js";
import type {
  OpenAIBackendErrorCategory,
  OpenAIStreamOptions,
} from "../providers/openai.js";
import { OpenAIBackendError } from "../providers/openai.js";
import { cursorRequestToOpenAI } from "../translation.js";

export interface LocalChatDecision {
  model: RegisteredModel;
  request: StreamUnifiedChatRequestWithTools;
}

export function getLocalChatDecision(
  payload: Buffer,
  models: ModelRegistry,
): LocalChatDecision | undefined {
  const request = fromBinary(StreamUnifiedChatRequestWithToolsSchema, payload);
  const modelName = request.streamUnifiedChatRequest?.modelDetails?.modelName;
  const model = models.get(modelName);
  if (model === undefined) {
    return undefined;
  }
  return { model, request };
}

export async function writeLocalChatResponse(
  response: ServerResponse,
  decision: LocalChatDecision,
  logger: Logger,
  options: OpenAIStreamOptions = {},
): Promise<void> {
  response.statusCode = 200;
  response.setHeader("content-type", "application/connect+proto");
  const serverBubbleId = randomUUID();
  const messages = cursorRequestToOpenAI(decision.request);

  try {
    for await (const text of decision.model.provider.streamCompletion(
      messages,
      options,
    )) {
      response.write(
        encodeEnvelope(
          toBinary(
            StreamUnifiedChatResponseWithToolsSchema,
            create(StreamUnifiedChatResponseWithToolsSchema, {
              streamUnifiedChatResponse: create(
                StreamUnifiedChatResponseSchema,
                {
                  text,
                  serverBubbleId,
                },
              ),
              eventId: randomUUID(),
            }),
          ),
        ),
      );
    }
    response.end(encodeEndStream());
    logger.info("served local chat", { model: decision.model.id });
  } catch (error) {
    const failure = classifyLocalChatFailure(error);
    logger.error("local chat failed", {
      model: decision.model.id,
      error: error instanceof Error ? error.message : String(error),
      category: failure.category,
      retryAfter: failure.retryAfter,
    });
    endLocalChatFailure(response, serverBubbleId, failure);
  }
}

interface LocalChatFailure {
  category: OpenAIBackendErrorCategory;
  retryAfter: number | undefined;
}

function classifyLocalChatFailure(error: unknown): LocalChatFailure {
  if (error instanceof OpenAIBackendError) {
    return { category: error.category, retryAfter: error.retryAfter };
  }
  return { category: "unknown", retryAfter: undefined };
}

function endLocalChatFailure(
  response: ServerResponse,
  serverBubbleId: string,
  failure: LocalChatFailure,
): void {
  if (!response.headersSent) {
    response.statusCode = 200;
    response.setHeader("content-type", "application/connect+proto");
  }

  // Surface a clear, user-facing terminal notice (named cause) for rate-limit /
  // credit failures. The product decision is pre-stream failover + one-tap
  // resume on the ensemble, so we do NOT attempt a transparent mid-stream
  // cut-over here — we just tell the user what happened and keep the Connect
  // stream protocol valid for Cursor.
  const notice = failureNotice(failure);
  if (notice !== undefined) {
    response.write(
      encodeEnvelope(
        toBinary(
          StreamUnifiedChatResponseWithToolsSchema,
          create(StreamUnifiedChatResponseWithToolsSchema, {
            streamUnifiedChatResponse: create(StreamUnifiedChatResponseSchema, {
              text: notice,
              serverBubbleId,
            }),
            eventId: randomUUID(),
          }),
        ),
      ),
    );
  }

  response.end(encodeEndStream({ error: failureMetadata(failure.category) }));
}

function failureNotice(failure: LocalChatFailure): string | undefined {
  switch (failure.category) {
    case "quota_exhausted":
      return "\n\n> ⚠️ The model backend is out of credits / quota (vendor billing or hard quota). Re-run this turn on the fusion ensemble — it routes around the exhausted provider.";
    case "transient": {
      const wait =
        failure.retryAfter !== undefined
          ? ` (retry after ~${String(Math.ceil(failure.retryAfter))}s)`
          : "";
      return `\n\n> ⚠️ The model backend is rate-limited or temporarily overloaded${wait}. Re-run this turn on the fusion ensemble, or retry shortly.`;
    }
    case "auth_permanent":
    case "unknown":
      return undefined;
    default: {
      const exhaustive: never = failure.category;
      return exhaustive;
    }
  }
}

function failureMetadata(category: OpenAIBackendErrorCategory): string {
  switch (category) {
    case "quota_exhausted":
      return "model out of credits / quota";
    case "transient":
      return "model rate-limited or temporarily unavailable";
    case "auth_permanent":
      return "model auth or permission error";
    case "unknown":
      return "local model failed";
    default: {
      const exhaustive: never = category;
      return exhaustive;
    }
  }
}
