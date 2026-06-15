import type { ServerResponse } from "node:http";

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";

import { encodeEnvelope, encodeEndStream } from "../connectEnvelope.js";
import {
  AgentV1_ApiKeyCredentialsSchema,
  AgentV1_GetDefaultModelForCliResponseSchema,
  AgentV1_GetUsableModelsResponseSchema,
  AgentV1_ModelDetailsSchema,
  AgentV1_RequestedModel_ModelParameterValueSchema,
  AvailableModelsResponse_DegradationStatus,
  AvailableModelsResponse_AvailableModelSchema,
  AvailableModelsResponse_ModelVariantConfigSchema,
  AvailableModelsResponse_TooltipDataSchema,
  AvailableModelsResponse_ModelVendorId,
  AvailableModelsResponse_ModelVendorSchema,
  AvailableModelsResponseSchema,
  GetDefaultModelResponseSchema,
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
        degradationStatus:
          AvailableModelsResponse_DegradationStatus.AVAILABLE_MODELS_RESPONSE_DEGRADATION_STATUS_DEGRADATION_STATUS_UNSPECIFIED,
        supportsThinking: false,
        supportsImages: false,
        supportsAutoContext: false,
        supportsMaxMode: true,
        supportsNonMaxMode: true,
        supportsPlanMode: true,
        supportsSandboxing: false,
        supportsCmdK: false,
        cloudAgentEffortModes: [],
        clientDisplayName: model.displayName,
        serverModelName: model.id,
        inputboxShortModelName: model.displayName,
        contextTokenLimit: model.contextTokenLimit,
        isUserAdded: true,
        parameterDefinitions: localParameterDefinitions(),
        legacySlugs: [model.id],
        idAliases: uniqueStrings([model.id, model.displayName]),
        namedModelSectionIndex: 1,
        visibleInRoutedModelView: true,
        vendorName: "local",
        vendor: create(AvailableModelsResponse_ModelVendorSchema, {
          id: AvailableModelsResponse_ModelVendorId.AVAILABLE_MODELS_RESPONSE_MODEL_VENDOR_ID_MODEL_VENDOR_ID_UNSPECIFIED,
          displayName: "Local",
        }),
        variants: [
          localVariantConfig(model, false),
          localVariantConfig(model, true),
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

export function mergeDefaultModel(
  upstreamPayload: Buffer | undefined,
  models: ModelRegistry,
): Buffer {
  const upstream =
    upstreamPayload === undefined
      ? create(GetDefaultModelResponseSchema)
      : fromBinary(GetDefaultModelResponseSchema, upstreamPayload);
  const firstLocalModel = models.list()[0];
  if (firstLocalModel === undefined) {
    return Buffer.from(toBinary(GetDefaultModelResponseSchema, upstream));
  }

  return Buffer.from(
    toBinary(
      GetDefaultModelResponseSchema,
      create(GetDefaultModelResponseSchema, {
        ...upstream,
        model: firstLocalModel.id,
        thinkingModel: firstLocalModel.id,
        maxMode: true,
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
    aliases: uniqueStrings([model.id, model.displayName]),
    maxMode: false,
    apiKeyCredentials: create(AgentV1_ApiKeyCredentialsSchema, {
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
    }),
  });
}

function localVariantConfig(model: RegisteredModel, isMaxMode: boolean) {
  return create(AvailableModelsResponse_ModelVariantConfigSchema, {
    displayName: model.displayName,
    displayNameOutsidePicker: model.displayName,
    isMaxMode,
    isDefaultMaxConfig: isMaxMode,
    isDefaultNonMaxConfig: !isMaxMode,
    parameterValues: localParameterValues(isMaxMode),
    tooltipData: create(AvailableModelsResponse_TooltipDataSchema, {
      markdownContent: `**${model.displayName}**<br />Local OpenAI-compatible model.`,
    }),
    variantStringRepresentation: localVariantString(model.id, isMaxMode),
    legacySlug: model.id,
  });
}

function localVariantString(modelId: string, isMaxMode: boolean): string {
  const context = isMaxMode ? "1m" : "272k";
  return `${modelId}[context=${context},reasoning=medium,fast=false]`;
}

function localParameterDefinitions() {
  return [
    create(ModelParameterDefinitionSchema, {
      id: "context",
      name: "Context",
      markdownTooltip: "Context size the model has available.",
      parameterType: create(ModelParameterDefinition_ModelParameterTypeSchema, {
        enumParameter: create(
          ModelParameterDefinition_EnumParameterDefinitionSchema,
          {
            values: [
              create(
                ModelParameterDefinition_EnumParameterDefinition_EnumParameterValueSchema,
                { value: "272k", displayName: "272K" },
              ),
              create(
                ModelParameterDefinition_EnumParameterDefinition_EnumParameterValueSchema,
                { value: "1m", displayName: "1M" },
              ),
            ],
          },
        ),
      }),
    }),
    create(ModelParameterDefinitionSchema, {
      id: "reasoning",
      name: "Reasoning",
      markdownTooltip:
        "Reasoning effort the model uses to generate its response.",
      parameterType: create(ModelParameterDefinition_ModelParameterTypeSchema, {
        enumParameter: create(
          ModelParameterDefinition_EnumParameterDefinitionSchema,
          {
            values: [
              create(
                ModelParameterDefinition_EnumParameterDefinition_EnumParameterValueSchema,
                { value: "none", displayName: "None" },
              ),
              create(
                ModelParameterDefinition_EnumParameterDefinition_EnumParameterValueSchema,
                { value: "low", displayName: "Low" },
              ),
              create(
                ModelParameterDefinition_EnumParameterDefinition_EnumParameterValueSchema,
                { value: "medium", displayName: "Medium" },
              ),
              create(
                ModelParameterDefinition_EnumParameterDefinition_EnumParameterValueSchema,
                { value: "high", displayName: "High" },
              ),
              create(
                ModelParameterDefinition_EnumParameterDefinition_EnumParameterValueSchema,
                { value: "extra-high", displayName: "Extra High" },
              ),
            ],
          },
        ),
      }),
      isCycleableByHotkey: true,
    }),
    create(ModelParameterDefinitionSchema, {
      id: "fast",
      name: "Fast",
      markdownTooltip: "Use the provider's fast lane when supported.",
      parameterType: create(ModelParameterDefinition_ModelParameterTypeSchema, {
        booleanParameter: {
          values: [{ value: "false" }, { value: "true", displayName: "Fast" }],
        },
      }),
    }),
  ];
}

function localParameterValues(isMaxMode: boolean) {
  return [
    create(AgentV1_RequestedModel_ModelParameterValueSchema, {
      id: "context",
      value: isMaxMode ? "1m" : "272k",
    }),
    create(AgentV1_RequestedModel_ModelParameterValueSchema, {
      id: "reasoning",
      value: "medium",
    }),
    create(AgentV1_RequestedModel_ModelParameterValueSchema, {
      id: "fast",
      value: "false",
    }),
  ];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}
