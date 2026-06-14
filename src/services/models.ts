import type { ServerResponse } from "node:http";

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";

import { encodeEnvelope, encodeEndStream } from "../connectEnvelope.js";
import {
  AgentV1_ApiKeyCredentialsSchema,
  AgentV1_GetDefaultModelForCliResponseSchema,
  AgentV1_GetUsableModelsResponseSchema,
  AgentV1_ModelDetailsSchema,
  AgentV1_RequestedModel_ModelParameterValueSchema,
  AvailableModelsResponse_AvailableModelSchema,
  AvailableModelsResponse_ModelVariantConfigSchema,
  AvailableModelsResponse_TooltipDataSchema,
  AvailableModelsResponse_ModelVendorId,
  AvailableModelsResponse_ModelVendorSchema,
  AvailableModelsResponseSchema,
  ModelParameterDefinition_EnumParameterDefinition_EnumParameterValueSchema,
  ModelParameterDefinition_EnumParameterDefinitionSchema,
  ModelParameterDefinition_ModelParameterTypeSchema,
  ModelParameterDefinitionSchema,
} from "../gen/aiserver/v1/aiserver_pb.js";
import type { Logger } from "../logger.js";
import type { ModelRegistry, RegisteredModel } from "../models/registry.js";

export type ModelResponseFormat = "connect" | "proto";

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
        supportsAgent: true,
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
        parameterDefinitions: [localProviderParameterDefinition()],
        legacySlugs: [model.id],
        idAliases: [model.id],
        namedModelSectionIndex: 1,
        visibleInRoutedModelView: true,
        vendorName: "local",
        vendor: create(AvailableModelsResponse_ModelVendorSchema, {
          id: AvailableModelsResponse_ModelVendorId.AVAILABLE_MODELS_RESPONSE_MODEL_VENDOR_ID_MODEL_VENDOR_ID_UNSPECIFIED,
          displayName: "Local",
        }),
        variants: [
          create(AvailableModelsResponse_ModelVariantConfigSchema, {
            displayName: model.displayName,
            displayNameOutsidePicker: model.displayName,
            isMaxMode: false,
            isDefaultNonMaxConfig: true,
            parameterValues: [localProviderParameterValue()],
            tooltipData: create(AvailableModelsResponse_TooltipDataSchema, {
              markdownContent: `**${model.displayName}**<br />Local OpenAI-compatible model.`,
            }),
            variantStringRepresentation: `${model.id}[provider=local]`,
            legacySlug: model.id,
          }),
        ],
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

export function mergeUsableModels(
  upstreamPayload: Buffer | undefined,
  models: ModelRegistry,
): Buffer {
  const upstream =
    upstreamPayload === undefined
      ? create(AgentV1_GetUsableModelsResponseSchema)
      : fromBinary(AgentV1_GetUsableModelsResponseSchema, upstreamPayload);
  const modelIds = new Set(upstream.models.map((model) => model.modelId));
  const mergedModels = [...upstream.models];

  for (const model of models.list()) {
    if (modelIds.has(model.id)) {
      continue;
    }
    modelIds.add(model.id);
    mergedModels.push(localCliModelDetails(model));
  }

  return Buffer.from(
    toBinary(AgentV1_GetUsableModelsResponseSchema, {
      ...upstream,
      models: mergedModels,
    }),
  );
}

export function mergeDefaultModelForCli(
  upstreamPayload: Buffer | undefined,
  models: ModelRegistry,
): Buffer {
  if (upstreamPayload !== undefined) {
    const upstream = fromBinary(
      AgentV1_GetDefaultModelForCliResponseSchema,
      upstreamPayload,
    );
    if (upstream.model !== undefined) {
      return Buffer.from(
        toBinary(AgentV1_GetDefaultModelForCliResponseSchema, upstream),
      );
    }
  }

  const firstLocalModel = models.list()[0];
  const model =
    firstLocalModel === undefined
      ? undefined
      : localCliModelDetails(firstLocalModel);

  return Buffer.from(
    toBinary(
      AgentV1_GetDefaultModelForCliResponseSchema,
      create(AgentV1_GetDefaultModelForCliResponseSchema, {
        model,
      }),
    ),
  );
}

export function writeAvailableModelsResponse(
  response: ServerResponse,
  payload: Buffer,
  logger: Logger,
  format: ModelResponseFormat,
): void {
  writeModelResponse(
    response,
    payload,
    logger,
    "served available models",
    format,
  );
}

export function writeModelResponse(
  response: ServerResponse,
  payload: Buffer,
  logger: Logger,
  message: string,
  format: ModelResponseFormat,
): void {
  response.statusCode = 200;
  if (format === "connect") {
    response.setHeader("content-type", "application/connect+proto");
    response.write(encodeEnvelope(payload));
    response.end(encodeEndStream());
  } else {
    response.setHeader("content-type", "application/proto");
    response.end(payload);
  }
  logger.info(message, { bytes: payload.length });
}

function localCliModelDetails(model: RegisteredModel) {
  return create(AgentV1_ModelDetailsSchema, {
    modelId: model.id,
    displayModelId: model.id,
    displayName: model.displayName,
    displayNameShort: model.displayName,
    aliases: [model.id],
    maxMode: false,
    apiKeyCredentials: create(AgentV1_ApiKeyCredentialsSchema, {
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
    }),
  });
}

function localProviderParameterDefinition() {
  return create(ModelParameterDefinitionSchema, {
    id: "provider",
    name: "Provider",
    parameterType: create(ModelParameterDefinition_ModelParameterTypeSchema, {
      enumParameter: create(
        ModelParameterDefinition_EnumParameterDefinitionSchema,
        {
          values: [
            create(
              ModelParameterDefinition_EnumParameterDefinition_EnumParameterValueSchema,
              {
                value: "local",
                displayName: "Local",
              },
            ),
          ],
        },
      ),
    }),
  });
}

function localProviderParameterValue() {
  return create(AgentV1_RequestedModel_ModelParameterValueSchema, {
    id: "provider",
    value: "local",
  });
}
