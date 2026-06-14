import type { IncomingMessage, ServerResponse } from "node:http";

import type { BridgeConfig } from "./config.js";
import type { Logger } from "./logger.js";
import { redactValue } from "./redaction.js";
import type { RouteDecision } from "./routes.js";

export type RouteOutcome = "health" | "plugin" | "intercept" | "pass-through";

export interface RouteInventoryEntry {
  method: string;
  path: string;
  contentType: string;
  status: number;
  framing: string;
  policy: string;
  outcome: RouteOutcome;
}

export function attachRouteInventoryLogger(
  config: BridgeConfig,
  logger: Logger,
  request: IncomingMessage,
  response: ServerResponse,
  decision: RouteDecision,
  outcome: () => RouteOutcome,
): void {
  if (!config.routeInventoryEnabled) {
    return;
  }

  response.once("finish", () => {
    logger.info("desktop route inventory", {
      method: request.method ?? "GET",
      path: redactValue(decision.path),
      contentType: headerValue(request.headers["content-type"]),
      status: response.statusCode,
      framing: framingForContentType(request.headers["content-type"]),
      policy: decision.policy,
      outcome: outcome(),
    } satisfies RouteInventoryEntry);
  });
}

export function framingForContentType(
  value: string | string[] | undefined,
): string {
  const contentType = headerValue(value).toLowerCase();
  if (contentType.includes("application/connect+proto")) {
    return "connect-proto";
  }
  if (contentType.includes("application/proto")) {
    return "proto";
  }
  if (contentType.includes("application/json")) {
    return "json";
  }
  if (contentType.length === 0) {
    return "none";
  }
  return "other";
}

function headerValue(value: string | string[] | undefined): string {
  if (value === undefined) {
    return "";
  }
  return Array.isArray(value) ? value.join(", ") : value;
}
