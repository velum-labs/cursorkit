import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import https from "node:https";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { BridgeConfig } from "./config.js";
import { loadTlsMaterial } from "./certs.js";
import {
  firstMessageEnvelope,
  firstMessagePayload,
  isCompressedEnvelope,
} from "./connectEnvelope.js";
import {
  createExtensionManager,
  type ExtensionManager,
} from "./extensions/registry.js";
import type { CursorExtension, RequestMiddleware } from "./extensions/types.js";
import type { Logger } from "./logger.js";
import { ModelRegistry, registerConfiguredModels } from "./models/registry.js";
import { OpenAICompatibleProvider } from "./providers/openai.js";
import { loadCursorProto, type CursorProto } from "./proto.js";
import {
  classifyRoute,
  AVAILABLE_MODELS_PATH,
  STREAM_CHAT_WITH_TOOLS_PATH,
} from "./routes.js";
import {
  getLocalChatDecision,
  writeLocalChatResponse,
} from "./services/chat.js";
import {
  mergeAvailableModels,
  writeAvailableModelsResponse,
} from "./services/models.js";
import {
  fetchUpstreamBuffer,
  proxyBufferedRequest,
  proxyRequest,
  readRequestBody,
} from "./upstream.js";

export interface BridgeRuntime {
  config: BridgeConfig;
  logger: Logger;
  proto: CursorProto;
  models: ModelRegistry;
  extensions: ExtensionManager;
}

export async function createBridgeRuntime(
  config: BridgeConfig,
  logger: Logger,
): Promise<BridgeRuntime> {
  const proto = await loadCursorProto();
  const models = new ModelRegistry();
  registerConfiguredModels(
    models,
    config.models,
    (modelConfig) => new OpenAICompatibleProvider(modelConfig),
  );
  const extensions = createExtensionManager(models, logger);
  if (config.pluginPath !== undefined) {
    await extensions.load(await loadExtension(config.pluginPath));
  }
  return { config, logger, proto, models, extensions };
}

export async function startServer(runtime: BridgeRuntime): Promise<Server> {
  const listener = (request: IncomingMessage, response: ServerResponse) => {
    void handleRequest(runtime, request, response);
  };
  const server = runtime.config.useTls
    ? https.createServer(await loadTlsMaterial(runtime.config), listener)
    : http.createServer(listener);

  await new Promise<void>((resolve) => {
    server.listen(runtime.config.port, runtime.config.host, resolve);
  });
  runtime.logger.info("bridge listening", {
    host: runtime.config.host,
    port: runtime.config.port,
    tls: runtime.config.useTls,
    upstreamConfigured: runtime.config.upstreamBaseUrl !== undefined,
    localModels: runtime.models.list().map((model) => model.id),
  });
  return server;
}

async function handleRequest(
  runtime: BridgeRuntime,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.url === "/healthz") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  const decision = classifyRoute(request);
  await runMetadataOnlyRequestMiddleware(runtime, request);
  const handledByPlugin = await handlePluginRoute(
    runtime,
    request,
    response,
    decision.path,
  );
  if (handledByPlugin) {
    return;
  }
  runtime.logger.debug("route decision", { ...decision });
  if (decision.policy !== "intercept") {
    proxyRequest(request, response, runtime.config, runtime.logger);
    return;
  }

  try {
    if (decision.path === AVAILABLE_MODELS_PATH) {
      await handleAvailableModels(runtime, request, response);
      return;
    }
    if (decision.path === STREAM_CHAT_WITH_TOOLS_PATH) {
      await handleChat(runtime, request, response);
      return;
    }
  } catch (error) {
    runtime.logger.error("intercept failed", {
      path: decision.path,
      error: error instanceof Error ? error.message : String(error),
    });
    if (runtime.config.failOpen) {
      response.writeHead(502, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          error: "intercept failed after request body was consumed",
        }),
      );
      return;
    }
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "intercept failed" }));
    return;
  }

  proxyRequest(request, response, runtime.config, runtime.logger);
}

async function handlePluginRoute(
  runtime: BridgeRuntime,
  request: IncomingMessage,
  response: ServerResponse,
  pathName: string,
): Promise<boolean> {
  for (const route of runtime.extensions.context.routes.list()) {
    if (route.path !== pathName) {
      continue;
    }
    if (route.bodyAccess !== "consume") {
      runtime.logger.warn(
        "plugin route declined because bodyAccess is not consume",
        { path: route.path },
      );
      return false;
    }
    return route.handle(request, response);
  }
  return false;
}

async function runMetadataOnlyRequestMiddleware(
  runtime: BridgeRuntime,
  request: IncomingMessage,
): Promise<void> {
  for (const middleware of runtime.extensions.context.middleware.list()) {
    if (middleware.kind !== "request") {
      continue;
    }
    const requestMiddleware = middleware as RequestMiddleware;
    if (requestMiddleware.bodyAccess === "metadata-only") {
      await requestMiddleware.run(request);
    }
  }
}

async function loadExtension(pluginPath: string): Promise<CursorExtension> {
  const resolvedPath = path.isAbsolute(pluginPath)
    ? pluginPath
    : path.resolve(process.cwd(), pluginPath);
  const imported = (await import(pathToFileURL(resolvedPath).href)) as {
    default?: CursorExtension;
  };
  if (imported.default === undefined) {
    throw new Error(
      `Plugin ${pluginPath} must export a default CursorExtension`,
    );
  }
  return imported.default;
}

async function handleAvailableModels(
  runtime: BridgeRuntime,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body = await readRequestBody(
    request,
    runtime.config.maxInterceptBodyBytes,
  );
  const upstreamBody = await fetchUpstreamBuffer(
    request,
    body,
    runtime.config,
  ).catch((error: unknown) => {
    runtime.logger.warn("available models upstream unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  });
  const merged = mergeAvailableModels(
    upstreamBody === undefined ? undefined : firstMessagePayload(upstreamBody),
    runtime.models,
  );
  writeAvailableModelsResponse(response, merged, runtime.logger);
}

async function handleChat(
  runtime: BridgeRuntime,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body = await readRequestBody(
    request,
    runtime.config.maxInterceptBodyBytes,
  );
  const envelope = firstMessageEnvelope(body);
  if (envelope === undefined || isCompressedEnvelope(envelope)) {
    await proxyBufferedRequest(
      request,
      response,
      body,
      runtime.config,
      runtime.logger,
    );
    return;
  }

  const decision = getLocalChatDecision(envelope.payload, runtime.models);
  if (decision === undefined) {
    await proxyBufferedRequest(
      request,
      response,
      body,
      runtime.config,
      runtime.logger,
    );
    return;
  }

  await writeLocalChatResponse(response, decision, runtime.logger);
}
