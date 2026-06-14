import type { IncomingMessage } from "node:http";

export const AVAILABLE_MODELS_PATH = "/aiserver.v1.AiService/AvailableModels";
export const GET_USABLE_MODELS_PATH = "/aiserver.v1.AiService/GetUsableModels";
export const GET_DEFAULT_MODEL_FOR_CLI_PATH =
  "/aiserver.v1.AiService/GetDefaultModelForCli";
export const NAME_AGENT_PATH = "/aiserver.v1.AiService/NameAgent";
export const GET_SERVER_CONFIG_PATH =
  "/aiserver.v1.ServerConfigService/GetServerConfig";
export const AGENT_RUN_SSE_PATH = "/agent.v1.AgentService/RunSSE";
export const BIDI_APPEND_PATH = "/aiserver.v1.BidiService/BidiAppend";
export const STREAM_CHAT_WITH_TOOLS_PATH =
  "/aiserver.v1.ChatService/StreamUnifiedChatWithTools";

export type RoutePolicy = "intercept" | "observe-only" | "pass-through";

export interface RouteDecision {
  path: string;
  policy: RoutePolicy;
  reason: string;
}

const INTERCEPTABLE_ROUTES = new Set([
  AVAILABLE_MODELS_PATH,
  GET_USABLE_MODELS_PATH,
  GET_DEFAULT_MODEL_FOR_CLI_PATH,
  NAME_AGENT_PATH,
  GET_SERVER_CONFIG_PATH,
  AGENT_RUN_SSE_PATH,
  BIDI_APPEND_PATH,
  STREAM_CHAT_WITH_TOOLS_PATH,
]);

export function classifyRoute(request: IncomingMessage): RouteDecision {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  if (INTERCEPTABLE_ROUTES.has(path)) {
    return {
      path,
      policy: "intercept",
      reason: "fixture-backed route allowlist",
    };
  }
  return { path, policy: "pass-through", reason: "default proxy policy" };
}
