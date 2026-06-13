export interface BridgeConfig {
  host: string;
  port: number;
  modelBaseUrl: string;
  modelApiKey: string;
  modelName: string;
  hardcodedResponse?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const port = Number.parseInt(env.BRIDGE_PORT ?? "9443", 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid BRIDGE_PORT: ${env.BRIDGE_PORT}`);
  }

  return {
    host: env.BRIDGE_HOST ?? "127.0.0.1",
    port,
    modelBaseUrl: env.MODEL_BASE_URL ?? "http://localhost:8080/v1",
    modelApiKey: env.MODEL_API_KEY ?? "",
    modelName: env.MODEL_NAME ?? "local-model",
    hardcodedResponse: env.BRIDGE_HARDCODED_RESPONSE,
  };
}
