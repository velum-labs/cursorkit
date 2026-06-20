import type { LocalModelConfig } from "./config.js";

/**
 * Builders that shape the Cursor desktop `applicationUser` state and local
 * model catalog entries. Extracted from `ckLauncher` so the (large) launcher
 * module is not also responsible for the desktop state-seed schema. These are
 * pure data transforms over plain JSON-shaped records.
 */

export function mergeLocalAgentBackendUrlsIntoApplicationUser(
  applicationUser: Record<string, unknown>,
  agentOrigin: string,
): void {
  const cursorCreds = ensureRecord(applicationUser, "cursorCreds");
  const urls = { default: agentOrigin };
  cursorCreds.agentBackendUrlPrivacy = urls;
  cursorCreds.agentBackendUrlNonPrivacy = urls;
}

export function mergeLocalDesktopModelsIntoApplicationUser(
  applicationUser: Record<string, unknown>,
  models: LocalModelConfig[],
): void {
  const localModelIds = new Set(models.map((model) => model.id));
  const current = Array.isArray(applicationUser.availableDefaultModels2)
    ? applicationUser.availableDefaultModels2.filter((item) => {
        if (!isPlainRecord(item) || typeof item.name !== "string") {
          return true;
        }
        return !localModelIds.has(item.name);
      })
    : [];
  applicationUser.availableDefaultModels2 = current;

  const aiSettings = ensureRecord(applicationUser, "aiSettings");
  for (const model of models) {
    appendUnique(ensureStringArray(aiSettings, "userAddedModels"), model.id);
    appendUnique(
      ensureStringArray(aiSettings, "modelOverrideEnabled"),
      model.id,
    );
    removeValue(
      ensureStringArray(aiSettings, "modelOverrideDisabled"),
      model.id,
    );
  }
  const preferences = ensureRecord(aiSettings, "modelParameterPreferences");
  const updatedAt = new Date().toISOString();
  for (const model of models) {
    preferences[model.id] = {
      modelId: model.id,
      parameters: localDesktopParameterValues(true),
      updatedAt,
    };
  }
  const firstModel = models[0];
  if (firstModel !== undefined) {
    applicationUser.useOpenAIKey = true;
    applicationUser.openAIBaseUrl = firstModel.baseUrl;
    applicationUser.openAIKey = firstModel.apiKey;
    const modelConfig = ensureRecord(aiSettings, "modelConfig");
    const selectedModel = {
      modelId: firstModel.id,
      parameters: localDesktopParameterValues(true),
    };
    for (const key of ["composer", "background-composer"]) {
      modelConfig[key] = {
        modelName: firstModel.id,
        maxMode: true,
        selectedModels: [selectedModel],
      };
    }
  }

  const featureModelConfigs = ensureRecord(
    applicationUser,
    "featureModelConfigs",
  );
  for (const value of Object.values(featureModelConfigs)) {
    if (!isPlainRecord(value)) {
      continue;
    }
    const fallbackModels = ensureStringArray(value, "fallbackModels");
    for (const model of models) {
      appendUnique(fallbackModels, model.id);
    }
  }
}

export function buildLocalDesktopModelEntry(
  model: LocalModelConfig,
): Record<string, unknown> {
  const tooltipData = {
    primaryText: "",
    secondaryText: "",
    secondaryWarningText: false,
    icon: "",
    tertiaryText: "",
    tertiaryTextUrl: "",
    markdownContent: `**${model.displayName}**<br />Local OpenAI-compatible model served by cursorkit.<br /><br />${model.contextTokenLimit.toLocaleString()} token context window`,
  };
  return {
    name: model.id,
    serverModelName: model.id,
    clientDisplayName: model.displayName,
    inputboxShortModelName: model.displayName,
    vendorName: "local",
    vendor: { displayName: "Local" },
    supportsAgent: true,
    supportsCmdK: false,
    supportsImages: false,
    supportsMaxMode: true,
    supportsNonMaxMode: true,
    supportsPlanMode: true,
    supportsSandboxing: false,
    supportsThinking: false,
    cloudAgentEffortModes: [],
    defaultOn: true,
    degradationStatus: 0,
    isRecommendedForBackgroundComposer: false,
    legacySlugs: [model.id],
    idAliases: [model.id, model.displayName],
    parameterDefinitions: localDesktopParameterDefinitions(),
    namedModelSectionIndex: 10_000,
    visibleInRoutedModelView: true,
    tooltipData,
    tooltipDataForMaxMode: tooltipData,
    variants: [
      localDesktopVariantConfig(model, tooltipData, false),
      localDesktopVariantConfig(model, tooltipData, true),
    ],
  };
}

function localDesktopVariantConfig(
  model: LocalModelConfig,
  tooltipData: Record<string, unknown>,
  isMaxMode: boolean,
): Record<string, unknown> {
  return {
    parameterValues: localDesktopParameterValues(isMaxMode),
    displayName: model.displayName,
    isMaxMode,
    isDefaultMaxConfig: isMaxMode,
    isDefaultNonMaxConfig: !isMaxMode,
    tooltipData,
    displayNameOutsidePicker: model.displayName,
    variantStringRepresentation: localDesktopVariantString(model.id, isMaxMode),
    legacySlug: model.id,
  };
}

function localDesktopVariantString(
  modelId: string,
  isMaxMode: boolean,
): string {
  const context = isMaxMode ? "1m" : "272k";
  return `${modelId}[context=${context},reasoning=medium,fast=false]`;
}

function localDesktopParameterValues(
  isMaxMode: boolean,
): Array<Record<string, string>> {
  return [
    { id: "context", value: isMaxMode ? "1m" : "272k" },
    { id: "reasoning", value: "medium" },
    { id: "fast", value: "false" },
  ];
}

function localDesktopParameterDefinitions(): Array<Record<string, unknown>> {
  return [
    {
      id: "context",
      name: "Context",
      markdownTooltip: "Context size the model has available.",
      parameterType: {
        enumParameter: {
          values: [
            { value: "272k", displayName: "272K" },
            { value: "1m", displayName: "1M" },
          ],
        },
      },
    },
    {
      id: "reasoning",
      name: "Reasoning",
      markdownTooltip:
        "Reasoning effort the model uses to generate its response.",
      parameterType: {
        enumParameter: {
          values: [
            { value: "none", displayName: "None" },
            { value: "low", displayName: "Low" },
            { value: "medium", displayName: "Medium" },
            { value: "high", displayName: "High" },
            { value: "extra-high", displayName: "Extra High" },
          ],
        },
      },
      isCycleableByHotkey: true,
    },
    {
      id: "fast",
      name: "Fast",
      markdownTooltip: "Use the provider's fast lane when supported.",
      parameterType: {
        booleanParameter: {
          values: [{ value: "false" }, { value: "true", displayName: "Fast" }],
        },
      },
    },
  ];
}

function ensureRecord(
  target: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  if (!isPlainRecord(target[key])) {
    target[key] = {};
  }
  return target[key] as Record<string, unknown>;
}

function ensureStringArray(
  target: Record<string, unknown>,
  key: string,
): string[] {
  const values = Array.isArray(target[key])
    ? target[key].filter((value): value is string => typeof value === "string")
    : [];
  target[key] = values;
  return values;
}

function appendUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function removeValue(values: string[], value: string): void {
  const index = values.indexOf(value);
  if (index !== -1) {
    values.splice(index, 1);
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
