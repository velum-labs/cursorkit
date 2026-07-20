export interface BridgeConfig {
  host: string;
  port: number;
  upstreamBaseUrl?: string;
  upstreamConnectHost?: string;
  upstreamConnectPort?: number;
  desktopMode: boolean;
  modelBaseUrl: string;
  modelApiKey: string;
  modelName: string;
  models: LocalModelConfig[];
  hardcodedResponse?: string;
  certPath?: string;
  keyPath?: string;
  tlsHostnames: string[];
  useTls: boolean;
  publicOrigin?: string;
  agentPublicOrigin?: string;
  desktopAgentHttpPort?: number;
  captureDir: string;
  captureEnabled: boolean;
  failOpen: boolean;
  logLevel: LogLevel;
  pluginPath?: string;
  authToken?: string;
  unsafeAllowNonLocalhost: boolean;
  maxInterceptBodyBytes: number;
  upstreamRequestTimeoutMs?: number;
  agentRunSseWaitTimeoutMs?: number;
  agentContextTimeoutMs?: number;
  agentNativeContextEnabled: boolean;
  toolResultTimeoutMs?: number;
  extensionSetupTimeoutMs?: number;
  routeInventoryEnabled: boolean;
  modelPayloadLogging: ModelPayloadLogging;
  agentToolPolicy: AgentToolPolicy;
  agentToolMaxIterations: number;
}

export type LogLevel = "debug" | "info" | "warn" | "error";
export type ModelPayloadLogging = "summary" | "full";
export type AgentToolPolicy = "safe" | "all";

export interface LocalReasoningCapability {
  status: "supported" | "unsupported" | "unknown";
  efforts?: Array<{
    id: string;
    label?: string;
    description?: string;
    aliases?: string[];
  }>;
  defaultEffort?: string;
  provenance: "provider" | "config" | "unknown";
}

export interface LocalModelConfig {
  id: string;
  displayName: string;
  providerModel: string;
  baseUrl: string;
  apiKey: string;
  contextTokenLimit: number;
  reasoning?: LocalReasoningCapability;
  requestTimeoutMs?: number;
  hardcodedResponse?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const port = Number.parseInt(env.BRIDGE_PORT ?? "9443", 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid BRIDGE_PORT: ${env.BRIDGE_PORT}`);
  }

  const host = env.BRIDGE_HOST ?? "127.0.0.1";
  const desktopMode = parseBoolean(env.BRIDGE_DESKTOP_MODE, false);
  const unsafeAllowNonLocalhost = parseBoolean(
    env.BRIDGE_UNSAFE_ALLOW_NON_LOCALHOST,
    false,
  );
  const authToken = emptyToUndefined(env.BRIDGE_AUTH_TOKEN);
  if (
    !unsafeAllowNonLocalhost &&
    authToken === undefined &&
    !isLocalhost(host)
  ) {
    throw new Error(
      `Refusing to bind bridge to non-localhost host ${host}. Set BRIDGE_AUTH_TOKEN or BRIDGE_UNSAFE_ALLOW_NON_LOCALHOST=true to override.`,
    );
  }

  const modelBaseUrl = env.MODEL_BASE_URL ?? "http://localhost:8080/v1";
  const modelApiKey = env.MODEL_API_KEY ?? "";
  const modelName = env.MODEL_NAME ?? "local-model";
  const providerModel = env.MODEL_PROVIDER_MODEL ?? modelName;
  const hardcodedResponse = env.BRIDGE_HARDCODED_RESPONSE;
  const models = parseModels(env, {
    id: modelName,
    displayName: modelName,
    providerModel,
    baseUrl: modelBaseUrl,
    apiKey: modelApiKey,
    contextTokenLimit: parseInteger(env.MODEL_CONTEXT_TOKEN_LIMIT, 128000),
    requestTimeoutMs: parseOptionalPositiveInteger(
      env.MODEL_REQUEST_TIMEOUT_MS,
    ),
    hardcodedResponse,
  });

  return {
    host,
    port,
    upstreamBaseUrl:
      emptyToUndefined(env.CURSOR_UPSTREAM_BASE_URL) ??
      (desktopMode ? "https://api2.cursor.sh" : undefined),
    upstreamConnectHost: emptyToUndefined(env.CURSOR_UPSTREAM_CONNECT_HOST),
    upstreamConnectPort:
      emptyToUndefined(env.CURSOR_UPSTREAM_CONNECT_PORT) === undefined
        ? undefined
        : parseInteger(env.CURSOR_UPSTREAM_CONNECT_PORT, 443),
    desktopMode,
    modelBaseUrl,
    modelApiKey,
    modelName,
    models,
    hardcodedResponse,
    certPath: emptyToUndefined(env.BRIDGE_CERT_PATH),
    keyPath: emptyToUndefined(env.BRIDGE_KEY_PATH),
    tlsHostnames: parseCsv(
      env.BRIDGE_TLS_HOSTNAMES,
      desktopMode
        ? [
            "api2.cursor.sh",
            "api3.cursor.sh",
            "agent.api5.cursor.sh",
            "agentn.api5.cursor.sh",
            "agentn.global.api5.cursor.sh",
            "localhost",
            "127.0.0.1",
            "::1",
          ]
        : ["localhost", "127.0.0.1", "::1"],
    ),
    useTls: parseBoolean(env.BRIDGE_USE_TLS, false),
    publicOrigin:
      emptyToUndefined(env.BRIDGE_PUBLIC_ORIGIN) ??
      (desktopMode ? "https://api2.cursor.sh" : undefined),
    agentPublicOrigin: emptyToUndefined(env.BRIDGE_AGENT_PUBLIC_ORIGIN),
    desktopAgentHttpPort:
      emptyToUndefined(env.BRIDGE_DESKTOP_AGENT_HTTP_PORT) === undefined
        ? undefined
        : parseInteger(env.BRIDGE_DESKTOP_AGENT_HTTP_PORT, 0),
    captureDir: env.BRIDGE_CAPTURE_DIR ?? "fixtures/captures",
    captureEnabled: parseBoolean(env.BRIDGE_CAPTURE_ENABLED, false),
    failOpen: parseBoolean(env.BRIDGE_FAIL_OPEN, true),
    logLevel: parseLogLevel(env.BRIDGE_LOG_LEVEL),
    pluginPath: emptyToUndefined(env.BRIDGE_PLUGIN_PATH),
    authToken,
    unsafeAllowNonLocalhost,
    maxInterceptBodyBytes: parseInteger(
      env.BRIDGE_MAX_INTERCEPT_BODY_BYTES,
      50 * 1024 * 1024,
    ),
    upstreamRequestTimeoutMs: parseOptionalPositiveInteger(
      env.BRIDGE_UPSTREAM_REQUEST_TIMEOUT_MS,
    ),
    agentRunSseWaitTimeoutMs: parseOptionalPositiveInteger(
      env.BRIDGE_AGENT_RUN_SSE_WAIT_TIMEOUT_MS,
    ),
    agentContextTimeoutMs: parseOptionalPositiveInteger(
      env.BRIDGE_AGENT_CONTEXT_TIMEOUT_MS,
    ),
    agentNativeContextEnabled: parseBoolean(
      env.BRIDGE_AGENT_NATIVE_CONTEXT,
      true,
    ),
    toolResultTimeoutMs: parseOptionalPositiveInteger(
      env.BRIDGE_AGENT_TOOL_RESULT_TIMEOUT_MS,
    ),
    extensionSetupTimeoutMs: parseOptionalPositiveInteger(
      env.BRIDGE_EXTENSION_SETUP_TIMEOUT_MS,
    ),
    routeInventoryEnabled:
      desktopMode || parseBoolean(env.BRIDGE_ROUTE_INVENTORY, false),
    modelPayloadLogging: parseModelPayloadLogging(
      env.BRIDGE_LOG_MODEL_PAYLOADS,
    ),
    agentToolPolicy: parseAgentToolPolicy(env.BRIDGE_AGENT_TOOL_POLICY),
    agentToolMaxIterations: parseInteger(
      env.BRIDGE_AGENT_TOOL_MAX_ITERATIONS,
      8,
    ),
  };
}

function parseModelPayloadLogging(
  value: string | undefined,
): ModelPayloadLogging {
  if (value === "full") {
    return "full";
  }
  return "summary";
}

function parseAgentToolPolicy(value: string | undefined): AgentToolPolicy {
  if (value === undefined || value === "") {
    return "safe";
  }
  if (value === "safe" || value === "all") {
    return value;
  }
  throw new Error("BRIDGE_AGENT_TOOL_POLICY must be safe or all");
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
  const items = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && parsed.version === 2 && Array.isArray(parsed.models)
      ? parsed.models
      : undefined;
  if (items === undefined) {
    throw new Error(
      "BRIDGE_MODELS_JSON must be a legacy JSON array or version 2 model envelope",
    );
  }

  return items.map((item, index) => {
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
      providerModel:
        typeof item.providerModel === "string" ? item.providerModel : id,
      baseUrl,
      apiKey: typeof item.apiKey === "string" ? item.apiKey : "",
      contextTokenLimit:
        typeof item.contextTokenLimit === "number" &&
        Number.isFinite(item.contextTokenLimit)
          ? item.contextTokenLimit
          : fallback.contextTokenLimit,
      ...(parseReasoningCapability(item.reasoning) !== undefined
        ? { reasoning: parseReasoningCapability(item.reasoning) }
        : {}),
      requestTimeoutMs:
        typeof item.requestTimeoutMs === "number" &&
        Number.isFinite(item.requestTimeoutMs) &&
        item.requestTimeoutMs > 0
          ? item.requestTimeoutMs
          : fallback.requestTimeoutMs,
      hardcodedResponse:
        typeof item.hardcodedResponse === "string"
          ? item.hardcodedResponse
          : undefined,
    };
  });
}

function parseReasoningCapability(
  value: unknown,
): LocalReasoningCapability | undefined {
  if (
    !isRecord(value) ||
    (value.status !== "supported" &&
      value.status !== "unsupported" &&
      value.status !== "unknown") ||
    (value.provenance !== "provider" &&
      value.provenance !== "config" &&
      value.provenance !== "unknown")
  ) {
    return undefined;
  }
  const efforts = Array.isArray(value.efforts)
    ? value.efforts.flatMap((effort) => {
        if (!isRecord(effort) || typeof effort.id !== "string") return [];
        return [
          {
            id: effort.id,
            ...(typeof effort.label === "string"
              ? { label: effort.label }
              : {}),
            ...(typeof effort.description === "string"
              ? { description: effort.description }
              : {}),
            ...(Array.isArray(effort.aliases)
              ? {
                  aliases: effort.aliases.filter(
                    (alias): alias is string => typeof alias === "string",
                  ),
                }
              : {}),
          },
        ];
      })
    : undefined;
  return {
    status: value.status,
    provenance: value.provenance,
    ...(efforts !== undefined ? { efforts } : {}),
    ...(typeof value.defaultEffort === "string"
      ? { defaultEffort: value.defaultEffort }
      : {}),
  };
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

function parseOptionalPositiveInteger(
  value: string | undefined,
): number | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid integer value: ${value}`);
  }
  return parsed;
}

function parseCsv(value: string | undefined, fallback: string[]): string[] {
  if (value === undefined || value === "") {
    return fallback;
  }
  const parsed = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (parsed.length === 0) {
    throw new Error("CSV value must contain at least one non-empty item");
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
