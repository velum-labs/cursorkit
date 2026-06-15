import type { IncomingMessage } from "node:http";

export const AVAILABLE_MODELS_PATH = "/aiserver.v1.AiService/AvailableModels";
export const GET_USABLE_MODELS_PATH = "/aiserver.v1.AiService/GetUsableModels";
export const GET_DEFAULT_MODEL_FOR_CLI_PATH =
  "/aiserver.v1.AiService/GetDefaultModelForCli";
export const GET_DEFAULT_MODEL_PATH = "/aiserver.v1.AiService/GetDefaultModel";
export const NAME_AGENT_PATH = "/aiserver.v1.AiService/NameAgent";
export const GET_SERVER_CONFIG_PATH =
  "/aiserver.v1.ServerConfigService/GetServerConfig";
export const AGENT_RUN_PATH = "/agent.v1.AgentService/Run";
export const AGENT_RUN_SSE_PATH = "/agent.v1.AgentService/RunSSE";
export const BIDI_APPEND_PATH = "/aiserver.v1.BidiService/BidiAppend";
export const STREAM_CHAT_WITH_TOOLS_PATH =
  "/aiserver.v1.ChatService/StreamUnifiedChatWithTools";
export const UPLOAD_ISSUE_TRACE_PATH =
  "/aiserver.v1.AnalyticsService/UploadIssueTrace";
export const AUTH_FULL_STRIPE_PROFILE_PATH = "/auth/full_stripe_profile";
export const AUTH_STRIPE_PROFILE_PATH = "/auth/stripe_profile";

export type RoutePolicy = "intercept" | "observe-only" | "pass-through";
export type RouteSupportLevel =
  | "implemented"
  | "conditional"
  | "observe-first"
  | "unsupported";

export interface RouteContractSeed {
  path: string;
  packageName?: string;
  service?: string;
  method?: string;
  policy: RoutePolicy;
  supportLevel: RouteSupportLevel;
  owner: "bridge-core" | "desktop-observation" | "upstream";
  expectedMethods: string[];
  expectedContentTypes: string[];
  reason: string;
  uncertainty: string;
}

export interface RouteDecision {
  path: string;
  policy: RoutePolicy;
  reason: string;
}

export const ROUTE_CONTRACT_SEEDS: readonly RouteContractSeed[] = [
  {
    path: AVAILABLE_MODELS_PATH,
    packageName: "aiserver.v1",
    service: "AiService",
    method: "AvailableModels",
    policy: "intercept",
    supportLevel: "implemented",
    owner: "bridge-core",
    expectedMethods: ["POST"],
    expectedContentTypes: ["application/proto", "application/connect+proto"],
    reason: "Merge conservative local model entries with upstream models.",
    uncertainty:
      "Model metadata fields beyond local id/display/context remain fixture-gated.",
  },
  {
    path: GET_USABLE_MODELS_PATH,
    packageName: "aiserver.v1",
    service: "AiService",
    method: "GetUsableModels",
    policy: "intercept",
    supportLevel: "implemented",
    owner: "bridge-core",
    expectedMethods: ["POST"],
    expectedContentTypes: ["application/proto", "application/connect+proto"],
    reason:
      "Cursor Agent CLI reads this route for its model picker; merge local model entries with upstream usable models.",
    uncertainty:
      "Desktop model picker usage must be confirmed by route inventory before adding desktop-specific assumptions.",
  },
  {
    path: GET_DEFAULT_MODEL_FOR_CLI_PATH,
    packageName: "aiserver.v1",
    service: "AiService",
    method: "GetDefaultModelForCli",
    policy: "intercept",
    supportLevel: "implemented",
    owner: "bridge-core",
    expectedMethods: ["POST"],
    expectedContentTypes: ["application/proto", "application/connect+proto"],
    reason:
      "Preserve upstream's CLI default model when present; otherwise provide the first registered local model.",
    uncertainty:
      "Client-specific default selection remains gated by observed CLI/ACP traffic.",
  },
  {
    path: GET_DEFAULT_MODEL_PATH,
    packageName: "aiserver.v1",
    service: "AiService",
    method: "GetDefaultModel",
    policy: "intercept",
    supportLevel: "implemented",
    owner: "bridge-core",
    expectedMethods: ["POST"],
    expectedContentTypes: ["application/proto", "application/connect+proto"],
    reason:
      "Return the first registered local model as a fallback default for non-CLI callers.",
    uncertainty:
      "Desktop reliance on this route is not yet proven by captured traffic.",
  },
  {
    path: NAME_AGENT_PATH,
    packageName: "aiserver.v1",
    service: "AiService",
    method: "NameAgent",
    policy: "intercept",
    supportLevel: "implemented",
    owner: "bridge-core",
    expectedMethods: ["POST"],
    expectedContentTypes: ["application/proto", "application/connect+proto"],
    reason: "Provide a local fallback name for Cursor Agent sessions.",
    uncertainty:
      "Exact naming behavior can be refined once real client naming fixtures are replayed.",
  },
  {
    path: GET_SERVER_CONFIG_PATH,
    packageName: "aiserver.v1",
    service: "ServerConfigService",
    method: "GetServerConfig",
    policy: "intercept",
    supportLevel: "implemented",
    owner: "bridge-core",
    expectedMethods: ["POST"],
    expectedContentTypes: ["application/proto", "application/connect+proto"],
    reason:
      "Rewrite agent URLs to the bridge origin and force HTTP/2 off for local bridge compatibility.",
    uncertainty:
      "Additional desktop server-config fields stay pass-through until captured fixtures prove they are needed.",
  },
  {
    path: AUTH_FULL_STRIPE_PROFILE_PATH,
    policy: "intercept",
    supportLevel: "implemented",
    owner: "bridge-core",
    expectedMethods: ["GET", "POST"],
    expectedContentTypes: ["application/json", "none"],
    reason:
      "Provide a local desktop auth-profile shim for Cursor desktop experiments.",
    uncertainty:
      "HTTP auth profile routes are not proto-backed; exact desktop expectations remain traffic-gated.",
  },
  {
    path: AUTH_STRIPE_PROFILE_PATH,
    policy: "intercept",
    supportLevel: "implemented",
    owner: "bridge-core",
    expectedMethods: ["GET", "POST"],
    expectedContentTypes: ["application/json", "none"],
    reason:
      "Provide a local desktop auth-profile shim for Cursor desktop experiments.",
    uncertainty:
      "HTTP auth profile routes are not proto-backed; exact desktop expectations remain traffic-gated.",
  },
  {
    path: AGENT_RUN_PATH,
    packageName: "agent.v1",
    service: "AgentService",
    method: "Run",
    policy: "intercept",
    supportLevel: "conditional",
    owner: "bridge-core",
    expectedMethods: ["POST"],
    expectedContentTypes: ["application/proto", "application/connect+proto"],
    reason:
      "Handle local Agent Run requests when the selected model is registered locally; otherwise preserve upstream behavior.",
    uncertainty:
      "Connect/native streaming shape needs broader fixture replay before this becomes fully fixture-backed.",
  },
  {
    path: AGENT_RUN_SSE_PATH,
    packageName: "agent.v1",
    service: "AgentService",
    method: "RunSSE",
    policy: "intercept",
    supportLevel: "conditional",
    owner: "bridge-core",
    expectedMethods: ["POST"],
    expectedContentTypes: ["application/proto", "application/connect+proto"],
    reason:
      "Serve Cursor Agent local-model runs when paired with a matching BidiAppend payload.",
    uncertainty:
      "Bidi request-id flow and payload framing need captured fixture replay across CLI and ACP.",
  },
  {
    path: BIDI_APPEND_PATH,
    packageName: "aiserver.v1",
    service: "BidiService",
    method: "BidiAppend",
    policy: "intercept",
    supportLevel: "conditional",
    owner: "bridge-core",
    expectedMethods: ["POST"],
    expectedContentTypes: ["application/proto", "application/connect+proto"],
    reason:
      "Decode Cursor Agent client messages and register pending local-model runs.",
    uncertainty:
      "Observed payload encodings include surprising nested forms; unsupported forms must pass through.",
  },
  {
    path: STREAM_CHAT_WITH_TOOLS_PATH,
    packageName: "aiserver.v1",
    service: "ChatService",
    method: "StreamUnifiedChatWithTools",
    policy: "intercept",
    supportLevel: "conditional",
    owner: "bridge-core",
    expectedMethods: ["POST"],
    expectedContentTypes: ["application/proto", "application/connect+proto"],
    reason:
      "Handle requests only when selected model is registered locally; otherwise pass upstream.",
    uncertainty:
      "SSE, Poll, and idempotent chat variants stay pass-through until observed and decoded.",
  },
  {
    path: UPLOAD_ISSUE_TRACE_PATH,
    packageName: "aiserver.v1",
    service: "AnalyticsService",
    method: "UploadIssueTrace",
    policy: "intercept",
    supportLevel: "implemented",
    owner: "bridge-core",
    expectedMethods: ["POST"],
    expectedContentTypes: ["application/proto", "application/connect+proto"],
    reason:
      "Acknowledge issue-trace uploads locally to avoid forwarding sensitive diagnostic blobs during local experiments.",
    uncertainty:
      "Full payload redaction and fixture coverage remain part of the reliability/security workstream.",
  },
];

export const INTERCEPTABLE_ROUTE_PATHS = ROUTE_CONTRACT_SEEDS.filter(
  (route) => route.policy === "intercept",
).map((route) => route.path);

const INTERCEPTABLE_ROUTES = new Map(
  ROUTE_CONTRACT_SEEDS.filter((route) => route.policy === "intercept").map(
    (route) => [route.path, route],
  ),
);

export function classifyRoute(request: IncomingMessage): RouteDecision {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  const route = INTERCEPTABLE_ROUTES.get(path);
  if (route === undefined) {
    return { path, policy: "pass-through", reason: "default proxy policy" };
  }
  const method = request.method?.toUpperCase() ?? "GET";
  if (!route.expectedMethods.includes(method)) {
    return {
      path,
      policy: "pass-through",
      reason: `method ${method} not in route contract`,
    };
  }
  const contentType = requestContentType(request);
  if (!routeAllowsContentType(route, contentType)) {
    return {
      path,
      policy: "pass-through",
      reason:
        contentType === undefined
          ? "missing content-type not in route contract"
          : `content-type ${contentType} not in route contract`,
    };
  }
  if (route.policy === "intercept") {
    return {
      path,
      policy: "intercept",
      reason: "fixture-backed route allowlist",
    };
  }
  return { path, policy: "pass-through", reason: "default proxy policy" };
}

function requestContentType(request: IncomingMessage): string | undefined {
  const header = request.headers["content-type"];
  const value = Array.isArray(header) ? header[0] : header;
  const mediaType = value?.split(";")[0]?.trim().toLowerCase();
  return mediaType === undefined || mediaType.length === 0
    ? undefined
    : mediaType;
}

function routeAllowsContentType(
  route: RouteContractSeed,
  contentType: string | undefined,
): boolean {
  if (contentType === undefined) {
    return route.expectedContentTypes.includes("none");
  }
  return route.expectedContentTypes.includes(contentType);
}
