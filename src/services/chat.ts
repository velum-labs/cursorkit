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
import type { OpenAIStreamOptions } from "../providers/openai.js";
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
    logger.error("local chat failed", {
      model: decision.model.id,
      error: error instanceof Error ? error.message : String(error),
    });
    endLocalChatFailure(response);
  }
}

function endLocalChatFailure(response: ServerResponse): void {
  if (!response.headersSent) {
    response.statusCode = 200;
    response.setHeader("content-type", "application/connect+proto");
  }
  response.end(encodeEndStream({ error: "local model failed" }));
}
