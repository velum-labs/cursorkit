import type { Logger } from "../logger.js";
import type { ModelRegistry } from "../models/registry.js";
import type {
  CursorExtension,
  ExtensionContext,
  MiddlewareRegistry,
  RequestMiddleware,
  ResponseMiddleware,
  RouteInterceptor,
  RouteRegistry,
} from "./types.js";

class DefaultRouteRegistry implements RouteRegistry {
  private readonly routes = new Map<string, RouteInterceptor>();

  register(route: RouteInterceptor): void {
    if (this.routes.has(route.path)) {
      throw new Error(`Route already registered: ${route.path}`);
    }
    this.routes.set(route.path, route);
  }

  list(): RouteInterceptor[] {
    return Array.from(this.routes.values());
  }
}

class DefaultMiddlewareRegistry implements MiddlewareRegistry {
  private readonly middleware: Array<RequestMiddleware | ResponseMiddleware> =
    [];

  register(middleware: RequestMiddleware | ResponseMiddleware): void {
    this.middleware.push(middleware);
  }

  list(): Array<RequestMiddleware | ResponseMiddleware> {
    return [...this.middleware];
  }
}

export interface ExtensionManager {
  context: ExtensionContext;
  load(extension: CursorExtension): Promise<void>;
}

export function createExtensionManager(
  models: ModelRegistry,
  logger: Logger,
): ExtensionManager {
  const context: ExtensionContext = {
    models,
    routes: new DefaultRouteRegistry(),
    middleware: new DefaultMiddlewareRegistry(),
    logger,
  };

  return {
    context,
    async load(extension) {
      logger.info("loading extension", { extension: extension.name });
      await extension.setup(context);
    },
  };
}
