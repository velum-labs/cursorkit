import type { LocalModelConfig } from "../config.js";

export interface RegisteredModel {
  id: string;
  displayName: string;
  contextTokenLimit: number;
  provider: ModelProvider;
}

export interface ModelProvider {
  readonly name: string;
  streamCompletion(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  ): AsyncGenerator<string>;
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
      contextTokenLimit: config.contextTokenLimit,
      provider: providerFactory(config),
    });
  }
}
