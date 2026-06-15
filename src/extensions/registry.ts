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
      if (extension.manifest !== undefined) {
        validateManifest(extension.name, extension.manifest);
      }
      logger.info("loading trusted local extension", {
        extension: extension.name,
        apiVersion: extension.manifest?.apiVersion ?? "implicit-local",
        trusted: extension.manifest?.trusted ?? "local",
        permissions: extension.manifest?.permissions ?? ["legacy-full-local"],
      });
      await extension.setup(context);
    },
  };
}

function validateManifest(
  name: string,
  manifest: NonNullable<CursorExtension["manifest"]>,
): void {
  if (manifest.apiVersion !== "cursor-rpc/v1") {
    throw new Error(`Extension ${name} declares unsupported apiVersion`);
  }
  if (manifest.trusted !== "local") {
    throw new Error(`Extension ${name} must declare trusted=local`);
  }
}
