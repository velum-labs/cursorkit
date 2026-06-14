import type { ServerResponse } from "node:http";

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";

import { encodeEndStream, encodeEnvelope } from "../connectEnvelope.js";
import {
  AgentClientMessageSchema,
  AgentRunRequestSchema,
  AgentServerMessageSchema,
  type AgentRunRequest,
  InteractionUpdateSchema,
  TextDeltaUpdateSchema,
  TurnEndedUpdateSchema,
} from "../gen/agent/v1/agent_pb.js";
import type { Logger } from "../logger.js";
import type { ModelRegistry, RegisteredModel } from "../models/registry.js";
import type { ChatMessage } from "../providers/openai.js";

export interface LocalAgentRunDecision {
  model: RegisteredModel;
  messages: ChatMessage[];
}

export function getLocalAgentRunDecision(
  payload: Buffer,
  models: ModelRegistry,
): LocalAgentRunDecision | undefined {
  const request = fromBinary(AgentRunRequestSchema, payload);
  return getLocalAgentRunDecisionFromRequest(request, models);
}

export function getLocalAgentRunDecisionFromClientMessage(
  payload: Uint8Array,
  models: ModelRegistry,
): LocalAgentRunDecision | undefined {
  const message = fromBinary(AgentClientMessageSchema, payload);
  if (message.runRequest === undefined) {
    return undefined;
  }
  return getLocalAgentRunDecisionFromRequest(message.runRequest, models);
}

export function describeAgentRunPayload(payload: Uint8Array): string[] {
  const descriptions: string[] = [];
  try {
    const message = fromBinary(AgentClientMessageSchema, payload);
    descriptions.push(`client:${describeAgentRunRequest(message.runRequest)}`);
  } catch (error) {
    descriptions.push(`client:error:${errorMessage(error)}`);
  }
  try {
    descriptions.push(
      `run:${describeAgentRunRequest(
        fromBinary(AgentRunRequestSchema, payload),
      )}`,
    );
  } catch (error) {
    descriptions.push(`run:error:${errorMessage(error)}`);
  }
  return descriptions;
}

function getLocalAgentRunDecisionFromRequest(
  request: AgentRunRequest,
  models: ModelRegistry,
): LocalAgentRunDecision | undefined {
  const modelId =
    request.requestedModel?.modelId || request.modelDetails?.modelId;
  if (modelId === undefined || modelId.length === 0) {
    return undefined;
  }

  const model = models.get(modelId);
  if (model === undefined) {
    return undefined;
  }

  return {
    model,
    messages: [
      {
        role: "user",
        content: request.action?.userMessageAction?.userMessage?.text ?? "",
      },
    ],
  };
}

function describeAgentRunRequest(request: AgentRunRequest | undefined): string {
  if (request === undefined) {
    return "none";
  }
  const modelId =
    request.requestedModel?.modelId || request.modelDetails?.modelId || "none";
  const promptLength =
    request.action?.userMessageAction?.userMessage?.text.length ?? 0;
  return `model=${modelId},promptLength=${promptLength}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function writeLocalAgentRunResponse(
  response: ServerResponse,
  decision: LocalAgentRunDecision,
  logger: Logger,
): Promise<void> {
  response.statusCode = 200;
  response.setHeader("content-type", "application/connect+proto");

  let outputCharacters = 0;
  try {
    for await (const text of decision.model.provider.streamCompletion(
      decision.messages,
    )) {
      outputCharacters += text.length;
      response.write(
        encodeEnvelope(
          toBinary(
            AgentServerMessageSchema,
            create(AgentServerMessageSchema, {
              interactionUpdate: create(InteractionUpdateSchema, {
                textDelta: create(TextDeltaUpdateSchema, { text }),
              }),
            }),
          ),
        ),
      );
    }

    response.write(
      encodeEnvelope(
        toBinary(
          AgentServerMessageSchema,
          create(AgentServerMessageSchema, {
            interactionUpdate: create(InteractionUpdateSchema, {
              turnEnded: create(TurnEndedUpdateSchema, {
                outputTokens: BigInt(Math.ceil(outputCharacters / 4)),
              }),
            }),
          }),
        ),
      ),
    );
    response.end(encodeEndStream());
    logger.info("served local agent run", { model: decision.model.id });
  } catch (error) {
    logger.error("local agent run failed", {
      model: decision.model.id,
      error: error instanceof Error ? error.message : String(error),
    });
    if (!response.headersSent) {
      response.statusCode = 502;
      response.setHeader("content-type", "application/json");
    }
    response.end(JSON.stringify({ error: "local agent run failed" }));
  }
}
