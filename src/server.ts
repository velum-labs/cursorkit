import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import https from "node:https";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";

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
  AGENT_RUN_SSE_PATH,
  classifyRoute,
  AVAILABLE_MODELS_PATH,
  BIDI_APPEND_PATH,
  GET_DEFAULT_MODEL_FOR_CLI_PATH,
  GET_SERVER_CONFIG_PATH,
  GET_USABLE_MODELS_PATH,
  NAME_AGENT_PATH,
  STREAM_CHAT_WITH_TOOLS_PATH,
} from "./routes.js";
import { buildLocalNameAgentResponse } from "./services/agent.js";
import {
  getLocalChatDecision,
  writeLocalChatResponse,
} from "./services/chat.js";
import {
  describeAgentRunPayload,
  getLocalAgentRunDecision,
  getLocalAgentRunDecisionFromClientMessage,
  type LocalAgentRunDecision,
  writeLocalAgentRunResponse,
} from "./services/agentRun.js";
import {
  BidiAppendRequestSchema,
  BidiAppendResponseSchema,
  BidiRequestIdSchema,
} from "./gen/aiserver/v1/aiserver_pb.js";
import {
  mergeDefaultModelForCli,
  mergeAvailableModels,
  mergeUsableModels,
  type ModelResponseFormat,
  writeAvailableModelsResponse,
  writeModelResponse,
} from "./services/models.js";
import { rewriteServerConfigAgentUrls } from "./services/serverConfig.js";
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
  pendingAgentRuns: Map<string, LocalAgentRunDecision>;
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
  return {
    config,
    logger,
    proto,
    models,
    extensions,
    pendingAgentRuns: new Map(),
  };
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
    if (decision.path === GET_USABLE_MODELS_PATH) {
      await handleGetUsableModels(runtime, request, response);
      return;
    }
    if (decision.path === GET_DEFAULT_MODEL_FOR_CLI_PATH) {
      await handleGetDefaultModelForCli(runtime, request, response);
      return;
    }
    if (decision.path === NAME_AGENT_PATH) {
      await handleNameAgent(runtime, request, response);
      return;
    }
    if (decision.path === GET_SERVER_CONFIG_PATH) {
      await handleGetServerConfig(runtime, request, response);
      return;
    }
    if (decision.path === AGENT_RUN_SSE_PATH) {
      await handleAgentRun(runtime, request, response);
      return;
    }
    if (decision.path === BIDI_APPEND_PATH) {
      await handleBidiAppend(runtime, request, response);
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
  const format = modelResponseFormatForRequest(request);
  const merged = mergeAvailableModels(
    upstreamMessagePayload(upstreamBody, format),
    runtime.models,
  );
  writeAvailableModelsResponse(response, merged, runtime.logger, format);
}

async function handleGetUsableModels(
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
    runtime.logger.warn("usable models upstream unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  });
  const format = modelResponseFormatForRequest(request);
  const merged = mergeUsableModels(
    upstreamMessagePayload(upstreamBody, format),
    runtime.models,
  );
  writeModelResponse(
    response,
    merged,
    runtime.logger,
    "served usable models",
    format,
  );
}

async function handleGetDefaultModelForCli(
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
    runtime.logger.warn("default CLI model upstream unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  });
  const format = modelResponseFormatForRequest(request);
  const merged = mergeDefaultModelForCli(
    upstreamMessagePayload(upstreamBody, format),
    runtime.models,
  );
  writeModelResponse(
    response,
    merged,
    runtime.logger,
    "served default CLI model",
    format,
  );
}

async function handleNameAgent(
  runtime: BridgeRuntime,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const format = modelResponseFormatForRequest(request);
  await readRequestBody(request, runtime.config.maxInterceptBodyBytes);
  writeModelResponse(
    response,
    buildLocalNameAgentResponse(),
    runtime.logger,
    "served local name agent",
    format,
  );
}

async function handleGetServerConfig(
  runtime: BridgeRuntime,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body = await readRequestBody(
    request,
    runtime.config.maxInterceptBodyBytes,
  );
  const upstreamBody = await fetchUpstreamBuffer(request, body, runtime.config);
  if (upstreamBody === undefined) {
    throw new Error("GetServerConfig requires an upstream response");
  }
  const format = modelResponseFormatForRequest(request);
  const bridgeOrigin = requestOrigin(request, runtime.config.useTls);
  const payload = rewriteServerConfigAgentUrls(
    upstreamMessagePayload(upstreamBody, format) ?? upstreamBody,
    bridgeOrigin,
  );
  writeModelResponse(
    response,
    payload,
    runtime.logger,
    "served server config",
    format,
  );
}

function requestOrigin(request: IncomingMessage, useTls: boolean): string {
  const host = request.headers.host ?? "127.0.0.1";
  return `${useTls ? "https" : "http"}://${host}`;
}

function modelResponseFormatForRequest(
  request: IncomingMessage,
): ModelResponseFormat {
  const contentType = request.headers["content-type"];
  const value = Array.isArray(contentType) ? contentType[0] : contentType;
  return value?.includes("application/connect+proto") ? "connect" : "proto";
}

function upstreamMessagePayload(
  upstreamBody: Buffer | undefined,
  format: ModelResponseFormat,
): Buffer | undefined {
  if (upstreamBody === undefined) {
    return undefined;
  }
  return format === "connect"
    ? firstMessagePayload(upstreamBody)
    : upstreamBody;
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
  const format = modelResponseFormatForRequest(request);
  const payload = requestPayloadForFormat(body, format);
  if (payload === undefined) {
    await proxyBufferedRequest(
      request,
      response,
      body,
      runtime.config,
      runtime.logger,
    );
    return;
  }

  const decision = getLocalChatDecision(payload, runtime.models);
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

async function handleAgentRun(
  runtime: BridgeRuntime,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body = await readRequestBody(
    request,
    runtime.config.maxInterceptBodyBytes,
  );
  const format = modelResponseFormatForRequest(request);
  const payload = requestPayloadForFormat(body, format);
  if (payload === undefined) {
    await proxyBufferedRequest(
      request,
      response,
      body,
      runtime.config,
      runtime.logger,
    );
    return;
  }

  const requestId = getBidiRequestId(payload);
  const decision =
    requestId === undefined
      ? getLocalAgentRunDecision(payload, runtime.models)
      : await waitForPendingAgentRun(runtime, requestId);
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

  await writeLocalAgentRunResponse(response, decision, runtime.logger);
}

async function handleBidiAppend(
  runtime: BridgeRuntime,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const format = modelResponseFormatForRequest(request);
  const body = await readRequestBody(
    request,
    runtime.config.maxInterceptBodyBytes,
  );
  const payload = requestPayloadForFormat(body, format);
  if (payload === undefined) {
    await proxyBufferedRequest(
      request,
      response,
      body,
      runtime.config,
      runtime.logger,
    );
    return;
  }

  const append = fromBidiAppendPayload(payload);
  const requestId = append?.requestId?.requestId;
  const decision = decodeLocalAgentRunDecisionFromAppend(append, runtime);
  if (
    requestId === undefined ||
    requestId.length === 0 ||
    decision === undefined
  ) {
    runtime.logger.debug("bidi append did not match local agent run", {
      requestId,
      dataBytes: append?.dataBinary.length,
      dataChars: append?.data.length,
      candidates: append
        ? bidiAppendClientPayloadCandidates(append).map((candidate) => ({
            bytes: candidate.length,
            prefixHex: Buffer.from(candidate.subarray(0, 8)).toString("hex"),
            descriptions: describeAgentRunPayload(candidate),
          }))
        : [],
    });
    await proxyBufferedRequest(
      request,
      response,
      body,
      runtime.config,
      runtime.logger,
    );
    return;
  }

  runtime.pendingAgentRuns.set(requestId, decision);
  writeModelResponse(
    response,
    Buffer.from(
      toBinary(BidiAppendResponseSchema, create(BidiAppendResponseSchema)),
    ),
    runtime.logger,
    "served local bidi append",
    format,
  );
}

function getBidiRequestId(payload: Uint8Array): string | undefined {
  try {
    const requestId = fromBinary(BidiRequestIdSchema, payload);
    return requestId.requestId || undefined;
  } catch {
    return undefined;
  }
}

function requestPayloadForFormat(
  body: Buffer,
  format: ModelResponseFormat,
): Buffer | undefined {
  if (format === "proto") {
    return body;
  }
  const envelope = firstMessageEnvelope(body);
  if (envelope === undefined || isCompressedEnvelope(envelope)) {
    return undefined;
  }
  return envelope.payload;
}

function fromBidiAppendPayload(payload: Uint8Array) {
  try {
    return fromBinary(BidiAppendRequestSchema, payload);
  } catch {
    return undefined;
  }
}

function decodeLocalAgentRunDecisionFromAppend(
  append: ReturnType<typeof fromBidiAppendPayload>,
  runtime: BridgeRuntime,
): LocalAgentRunDecision | undefined {
  if (append === undefined) {
    return undefined;
  }

  for (const candidate of bidiAppendClientPayloadCandidates(append)) {
    try {
      const decision = getLocalAgentRunDecisionFromClientMessage(
        candidate,
        runtime.models,
      );
      if (decision !== undefined) {
        return decision;
      }
    } catch {
      // Try the raw run-request shape below.
    }
    try {
      const decision = getLocalAgentRunDecision(
        Buffer.from(candidate),
        runtime.models,
      );
      if (decision !== undefined) {
        return decision;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

function bidiAppendClientPayloadCandidates(
  append: NonNullable<ReturnType<typeof fromBidiAppendPayload>>,
): Uint8Array[] {
  const candidates: Uint8Array[] = [];
  if (append.dataBinary.length > 0) {
    candidates.push(append.dataBinary);
    try {
      candidates.push(firstMessagePayload(Buffer.from(append.dataBinary)));
    } catch {
      // Not a nested Connect frame.
    }
  }
  if (append.data.length > 0) {
    const hex = decodeHexPayload(append.data);
    if (hex !== undefined) {
      candidates.push(hex);
    }
    candidates.push(Buffer.from(append.data, "base64"));
    candidates.push(Buffer.from(append.data, "utf8"));
    candidates.push(Buffer.from(append.data, "latin1"));
  }
  return candidates;
}

function decodeHexPayload(data: string): Buffer | undefined {
  if (data.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(data)) {
    return undefined;
  }
  return Buffer.from(data, "hex");
}

async function waitForPendingAgentRun(
  runtime: BridgeRuntime,
  requestId: string,
): Promise<LocalAgentRunDecision | undefined> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const decision = runtime.pendingAgentRuns.get(requestId);
    if (decision !== undefined) {
      runtime.pendingAgentRuns.delete(requestId);
      return decision;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return undefined;
}
