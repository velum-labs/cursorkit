import type { LocalModelConfig } from "../config.js";
import type {
  ChatMessage,
  OpenAICompletionEvent,
  OpenAIStreamOptions,
  OpenAIToolDefinition,
} from "../providers/openai.js";

export interface RegisteredModel {
  id: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  contextTokenLimit: number;
  reasoning?: LocalModelConfig["reasoning"];
  provider: ModelProvider;
}

export interface ModelProvider {
  readonly name: string;
  streamCompletion(
    messages: ChatMessage[],
    options?: OpenAIStreamOptions,
  ): AsyncGenerator<string>;
  streamCompletionEvents?(
    messages: ChatMessage[],
    tools?: OpenAIToolDefinition[],
    options?: OpenAIStreamOptions,
  ): AsyncGenerator<OpenAICompletionEvent>;
}

export class ModelRegistry {
  private readonly models = new Map<string, RegisteredModel>();

  register(model: RegisteredModel): void {
    if (this.models.has(model.id)) {
      throw new Error(`Model already registered: ${model.id}`);
    }
    this.models.set(model.id, model);
  }

  get(id: string | undefined): RegisteredModel | undefined {
    if (id === undefined) {
      return undefined;
    }
    return this.models.get(id);
  }

  list(): RegisteredModel[] {
    return Array.from(this.models.values());
  }
}

export function registerConfiguredModels(
  registry: ModelRegistry,
  configs: LocalModelConfig[],
  providerFactory: (config: LocalModelConfig) => ModelProvider,
): void {
  for (const config of configs) {
    registry.register({
      id: config.id,
      displayName: config.displayName,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      contextTokenLimit: config.contextTokenLimit,
      ...(config.reasoning !== undefined
        ? { reasoning: config.reasoning }
        : {}),
      provider: providerFactory(config),
    });
  }
}
