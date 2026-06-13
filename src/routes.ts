import type { IncomingMessage } from "node:http";

export const AVAILABLE_MODELS_PATH = "/aiserver.v1.AiService/AvailableModels";
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
