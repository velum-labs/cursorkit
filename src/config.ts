export interface BridgeConfig {
  host: string;
  port: number;
  upstreamBaseUrl?: string;
  modelBaseUrl: string;
  modelApiKey: string;
  modelName: string;
  models: LocalModelConfig[];
  hardcodedResponse?: string;
  certPath?: string;
  keyPath?: string;
  useTls: boolean;
  captureDir: string;
  captureEnabled: boolean;
  failOpen: boolean;
  logLevel: LogLevel;
  pluginPath?: string;
  unsafeAllowNonLocalhost: boolean;
  maxInterceptBodyBytes: number;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LocalModelConfig {
  id: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  contextTokenLimit: number;
  hardcodedResponse?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const port = Number.parseInt(env.BRIDGE_PORT ?? "9443", 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid BRIDGE_PORT: ${env.BRIDGE_PORT}`);
  }

  const host = env.BRIDGE_HOST ?? "127.0.0.1";
  const unsafeAllowNonLocalhost = parseBoolean(
    env.BRIDGE_UNSAFE_ALLOW_NON_LOCALHOST,
    false,
  );
  if (!unsafeAllowNonLocalhost && !isLocalhost(host)) {
    throw new Error(
      `Refusing to bind bridge to non-localhost host ${host}. Set BRIDGE_UNSAFE_ALLOW_NON_LOCALHOST=true to override.`,
    );
  }

  const modelBaseUrl = env.MODEL_BASE_URL ?? "http://localhost:8080/v1";
  const modelApiKey = env.MODEL_API_KEY ?? "";
  const modelName = env.MODEL_NAME ?? "local-model";
  const hardcodedResponse = env.BRIDGE_HARDCODED_RESPONSE;
  const models = parseModels(env, {
    id: modelName,
    displayName: modelName,
    baseUrl: modelBaseUrl,
    apiKey: modelApiKey,
    contextTokenLimit: parseInteger(env.MODEL_CONTEXT_TOKEN_LIMIT, 128000),
    hardcodedResponse,
  });

  return {
    host,
    port,
    upstreamBaseUrl: emptyToUndefined(env.CURSOR_UPSTREAM_BASE_URL),
    modelBaseUrl,
    modelApiKey,
    modelName,
    models,
    hardcodedResponse,
    certPath: emptyToUndefined(env.BRIDGE_CERT_PATH),
    keyPath: emptyToUndefined(env.BRIDGE_KEY_PATH),
    useTls: parseBoolean(env.BRIDGE_USE_TLS, false),
    captureDir: env.BRIDGE_CAPTURE_DIR ?? "fixtures/captures",
    captureEnabled: parseBoolean(env.BRIDGE_CAPTURE_ENABLED, false),
    failOpen: parseBoolean(env.BRIDGE_FAIL_OPEN, true),
    logLevel: parseLogLevel(env.BRIDGE_LOG_LEVEL),
    pluginPath: emptyToUndefined(env.BRIDGE_PLUGIN_PATH),
    unsafeAllowNonLocalhost,
    maxInterceptBodyBytes: parseInteger(
      env.BRIDGE_MAX_INTERCEPT_BODY_BYTES,
      50 * 1024 * 1024,
    ),
  };
}

function parseModels(
  env: NodeJS.ProcessEnv,
  fallback: LocalModelConfig,
): LocalModelConfig[] {
  const raw = emptyToUndefined(env.BRIDGE_MODELS_JSON);
  if (raw === undefined) {
    return [fallback];
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("BRIDGE_MODELS_JSON must be a JSON array");
  }

  return parsed.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`BRIDGE_MODELS_JSON[${index}] must be an object`);
    }
    const id = requiredString(item.id, `BRIDGE_MODELS_JSON[${index}].id`);
    const baseUrl = requiredString(
      item.baseUrl,
      `BRIDGE_MODELS_JSON[${index}].baseUrl`,
    );
    return {
      id,
      displayName: typeof item.displayName === "string" ? item.displayName : id,
      baseUrl,
      apiKey: typeof item.apiKey === "string" ? item.apiKey : "",
      contextTokenLimit:
        typeof item.contextTokenLimit === "number" &&
        Number.isFinite(item.contextTokenLimit)
          ? item.contextTokenLimit
          : fallback.contextTokenLimit,
      hardcodedResponse:
        typeof item.hardcodedResponse === "string"
          ? item.hardcodedResponse
          : undefined,
    };
  });
}

function parseLogLevel(value: string | undefined): LogLevel {
  switch (value) {
    case undefined:
    case "":
      return "info";
    case "debug":
    case "info":
    case "warn":
    case "error":
      return value;
    default:
      throw new Error(`Invalid BRIDGE_LOG_LEVEL: ${value}`);
  }
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") {
    return fallback;
  }
  if (value === "true" || value === "1") {
    return true;
  }
  if (value === "false" || value === "0") {
    return false;
  }
  throw new Error(`Invalid boolean value: ${value}`);
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid integer value: ${value}`);
  }
  return parsed;
}

function isLocalhost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
