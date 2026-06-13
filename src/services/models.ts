import type { ServerResponse } from "node:http";

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";

import { encodeEnvelope, encodeEndStream } from "../connectEnvelope.js";
import {
  AvailableModelsResponse_AvailableModelSchema,
  AvailableModelsResponseSchema,
} from "../gen/aiserver/v1/aiserver_pb.js";
import type { Logger } from "../logger.js";
import type { ModelRegistry } from "../models/registry.js";

export function mergeAvailableModels(
  upstreamPayload: Buffer | undefined,
  models: ModelRegistry,
): Buffer {
  const upstream =
    upstreamPayload === undefined
      ? create(AvailableModelsResponseSchema)
      : fromBinary(AvailableModelsResponseSchema, upstreamPayload);
  const modelNames = new Set<string>(upstream.modelNames);
  const upstreamModels = [...upstream.models];

  for (const model of models.list()) {
    if (modelNames.has(model.id)) {
      continue;
    }
    modelNames.add(model.id);
    upstreamModels.push(
      create(AvailableModelsResponse_AvailableModelSchema, {
        name: model.id,
        defaultOn: false,
        isChatOnly: false,
        supportsAgent: false,
        supportsThinking: false,
        supportsImages: false,
        supportsAutoContext: false,
        supportsMaxMode: false,
        supportsNonMaxMode: true,
        supportsPlanMode: false,
        supportsSandboxing: false,
        supportsCmdK: false,
        clientDisplayName: model.displayName,
        serverModelName: model.id,
        inputboxShortModelName: model.displayName,
        contextTokenLimit: model.contextTokenLimit,
        isUserAdded: true,
      }),
    );
  }

  return Buffer.from(
    toBinary(AvailableModelsResponseSchema, {
      ...upstream,
      modelNames: Array.from(modelNames),
      models: upstreamModels,
    }),
  );
}

export function writeAvailableModelsResponse(
  response: ServerResponse,
  payload: Buffer,
  logger: Logger,
): void {
  response.statusCode = 200;
  response.setHeader("content-type", "application/connect+proto");
  response.write(encodeEnvelope(payload));
  response.end(encodeEndStream());
  logger.info("served available models", { bytes: payload.length });
}
