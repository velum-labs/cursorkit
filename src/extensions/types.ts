import type { IncomingMessage, ServerResponse } from "node:http";

import type { Logger } from "../logger.js";
import type { ModelRegistry } from "../models/registry.js";

export interface CursorExtension {
  name: string;
  setup(context: ExtensionContext): void | Promise<void>;
}

export interface ExtensionContext {
  models: ModelRegistry;
  routes: RouteRegistry;
  middleware: MiddlewareRegistry;
  logger: Logger;
}

export interface RouteRegistry {
  register(route: RouteInterceptor): void;
  list(): RouteInterceptor[];
}

export interface RouteInterceptor {
  path: string;
  bodyAccess: "metadata-only" | "consume";
  handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
}

export interface MiddlewareRegistry {
  register(middleware: RequestMiddleware | ResponseMiddleware): void;
  list(): Array<RequestMiddleware | ResponseMiddleware>;
}

export interface RequestMiddleware {
  kind: "request";
  bodyAccess: "metadata-only" | "consume";
  run(request: IncomingMessage): Promise<void> | void;
}

export interface ResponseMiddleware {
  kind: "response";
  run(response: ServerResponse): Promise<void> | void;
}
