import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import http2 from "node:http2";
import https from "node:https";
import path from "node:path";
import { pathToFileURL } from "node:url";
import zlib from "node:zlib";

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";

import {
  agentExecClientMessageFields,
  cursorOpenAITools,
  executeCursorToolCall,
} from "./agentTools/registry.js";
import type { BridgeConfig } from "./config.js";
import { loadTlsMaterial } from "./certs.js";
import {
  decodeEnvelopes,
  encodeEndStream,
  encodeEnvelope,
  firstMessageEnvelope,
  firstMessagePayload,
  isCompressedEnvelope,
  isEndStreamEnvelope,
  parseEnvelopes,
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
  attachRouteInventoryLogger,
  type RouteOutcome,
} from "./routeInventory.js";
import {
  AGENT_RUN_PATH,
  AGENT_RUN_SSE_PATH,
  AUTH_FULL_STRIPE_PROFILE_PATH,
  AUTH_STRIPE_PROFILE_PATH,
  classifyRoute,
  AVAILABLE_MODELS_PATH,
  BIDI_APPEND_PATH,
  GET_DEFAULT_MODEL_FOR_CLI_PATH,
  GET_DEFAULT_MODEL_PATH,
  GET_SERVER_CONFIG_PATH,
  GET_USABLE_MODELS_PATH,
  NAME_AGENT_PATH,
  STREAM_CHAT_WITH_TOOLS_PATH,
  UPLOAD_ISSUE_TRACE_PATH,
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
  withNativeRequestContext,
  writeLocalAgentRunResponse,
} from "./services/agentRun.js";
import { emitTrace, newTraceId } from "./trace.js";
import {
  AgentClientMessageSchema,
  AgentServerMessageSchema,
  ExecServerMessageSchema,
  InteractionUpdateSchema,
  RequestContextArgsSchema,
  TextDeltaUpdateSchema,
  TurnEndedUpdateSchema,
} from "./gen/agent/v1/agent_pb.js";
import type { ChatMessage, OpenAIToolCall } from "./providers/openai.js";
import {
  BidiAppendRequestSchema,
  BidiAppendResponseSchema,
  BidiRequestIdSchema,
  UploadIssueTraceRequestSchema,
} from "./gen/aiserver/v1/aiserver_pb.js";
import {
  mergeDefaultModelForCli,
  mergeDefaultModel,
  mergeAvailableModels,
  mergeUsableModels,
  type ModelResponseFormat,
  writeAvailableModelsResponse,
  writeModelResponse,
} from "./services/models.js";
import {
  buildLocalServerConfig,
  rewriteServerConfigAgentUrls,
} from "./services/serverConfig.js";
import {
  fetchUpstreamBuffer,
  proxyBufferedRequest,
  proxyRequest,
  RequestBodyTooLargeError,
  readRequestBody,
  UpstreamRequestTimeoutError,
} from "./upstream.js";

export interface BridgeRuntime {
  config: BridgeConfig;
  logger: Logger;
  proto: CursorProto;
  models: ModelRegistry;
  extensions: ExtensionManager;
  pendingAgentRuns: Map<string, PendingAgentRun>;
  pendingAgentContextRuns: Map<string, PendingAgentContextRun>;
  /**
   * Tool-result mailboxes for the SSE + BidiAppend Agent Run transport (used by
   * the real cursor-agent CLI). The streaming Connect path reads ExecClientMessage
   * tool results inline from the duplex request body; over SSE the results arrive
   * on separate BidiAppend POSTs, so the SSE tool loop awaits them here, keyed by
   * the Bidi request id.
   */
  toolResultMailboxes: Map<string, ToolResultMailbox>;
  nextAgentExecId: number;
}

/**
 * A single-consumer queue of ExecClientMessage payload buffers (each a binary
 * AgentClientMessage) delivered out-of-band via BidiAppend. Exposes an
 * AsyncIterator so the shared Cursor tool loop can await tool results exactly as
 * it does on the inline duplex stream.
 */
export class ToolResultMailbox {
  #queue: Buffer[] = [];
  #waiters: ((result: IteratorResult<Buffer>) => void)[] = [];
  #closed = false;

  push(payload: Buffer): void {
    const waiter = this.#waiters.shift();
    if (waiter !== undefined) {
      waiter({ done: false, value: payload });
      return;
    }
    this.#queue.push(payload);
  }

  close(): void {
    this.#closed = true;
    const waiters = this.#waiters.splice(0);
    for (const waiter of waiters) {
      waiter({ done: true, value: undefined });
    }
  }

  iterator(): AsyncIterator<Buffer> {
    return {
      next: (): Promise<IteratorResult<Buffer>> => {
        const queued = this.#queue.shift();
        if (queued !== undefined) {
          return Promise.resolve({ done: false, value: queued });
        }
        if (this.#closed) {
          return Promise.resolve({ done: true, value: undefined });
        }
        return new Promise((resolve) => this.#waiters.push(resolve));
      },
    };
  }
}

interface PendingAgentRun {
  decision: LocalAgentRunDecision;
  createdAt: number;
}

interface PendingAgentContextRun {
  execId: string;
  id: number;
  decision: LocalAgentRunDecision;
  createdAt: number;
}

interface StartableServer {
  listen(port: number, host: string): this;
  once(event: "error", listener: (error: Error) => void): this;
  once(event: "listening", listener: () => void): this;
  off(event: "error", listener: (error: Error) => void): this;
  off(event: "listening", listener: () => void): this;
  on(event: "close", listener: () => void): this;
  close(callback?: (error?: Error) => void): this;
}

const MAX_AGENT_STREAM_BYTES = 256 * 1024 * 1024;
const DEFAULT_AGENT_RUN_SSE_WAIT_TIMEOUT_MS = 5_000;
const DEFAULT_AGENT_CONTEXT_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_EXTENSION_SETUP_TIMEOUT_MS = 10_000;
const MAX_PENDING_AGENT_RUNS = 100;
const MAX_PENDING_AGENT_CONTEXT_RUNS = 100;

export async function createBridgeRuntime(
  config: BridgeConfig,
  logger: Logger,
): Promise<BridgeRuntime> {
  const proto = await loadCursorProto();
  const models = new ModelRegistry();
  registerConfiguredModels(
    models,
    config.models,
    (modelConfig) =>
      new OpenAICompatibleProvider(modelConfig, logger, {
        logFullPayload: config.modelPayloadLogging === "full",
      }),
  );
  const extensions = createExtensionManager(models, logger);
  if (config.pluginPath !== undefined) {
    try {
      await withTimeout(
        extensions.load(await loadExtension(config.pluginPath)),
        config.extensionSetupTimeoutMs ?? DEFAULT_EXTENSION_SETUP_TIMEOUT_MS,
        `Extension setup timed out for ${config.pluginPath}`,
      );
    } catch (error) {
      logger.error("extension load failed", {
        pluginPath: config.pluginPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    config,
    logger,
    proto,
    models,
    extensions,
    pendingAgentRuns: new Map(),
    pendingAgentContextRuns: new Map(),
    toolResultMailboxes: new Map(),
    nextAgentExecId: 1,
  };
}

export async function startServer(runtime: BridgeRuntime): Promise<Server> {
  const listener = (
    request: IncomingMessage | http2.Http2ServerRequest,
    response: ServerResponse | http2.Http2ServerResponse,
  ) => {
    void handleRequest(
      runtime,
      request as IncomingMessage,
      response as ServerResponse,
    );
  };
  const server = runtime.config.useTls
    ? runtime.config.desktopMode
      ? http2.createSecureServer(
          { ...(await loadTlsMaterial(runtime.config)), allowHTTP1: true },
          listener,
        )
      : https.createServer(await loadTlsMaterial(runtime.config), listener)
    : http.createServer(listener);
  const agentHttpPort = runtime.config.desktopAgentHttpPort;
  const agentHttpServer =
    agentHttpPort !== undefined ? http.createServer(listener) : undefined;

  await listenWithStartupErrors(
    server,
    runtime.config.port,
    runtime.config.host,
    "bridge",
  );
  if (agentHttpServer !== undefined && agentHttpPort !== undefined) {
    try {
      await listenWithStartupErrors(
        agentHttpServer,
        agentHttpPort,
        runtime.config.host,
        "desktop agent http",
      );
    } catch (error) {
      await closeServer(server);
      throw error;
    }
    server.on("close", () => {
      agentHttpServer.close();
    });
  }
  runtime.logger.info("bridge listening", {
    host: runtime.config.host,
    port: runtime.config.port,
    agentHttpPort: runtime.config.desktopAgentHttpPort,
    tls: runtime.config.useTls,
    upstreamConfigured: runtime.config.upstreamBaseUrl !== undefined,
    localModels: runtime.models.list().map((model) => model.id),
  });
  return server as unknown as Server;
}

function listenWithStartupErrors(
  server: StartableServer,
  port: number,
  host: string,
  name: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(new Error(`${name} listener failed to start: ${error.message}`));
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

function closeServer(server: StartableServer): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
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
  if (!authorizeRequest(runtime, request, response)) {
    return;
  }

  const decision = classifyRoute(request);
  let routeOutcome: RouteOutcome =
    decision.policy === "intercept" ? "intercept" : "pass-through";
  attachRouteInventoryLogger(
    runtime.config,
    runtime.logger,
    request,
    response,
    decision,
    () => routeOutcome,
  );
  await runMetadataOnlyRequestMiddleware(runtime, request);
  const handledByPlugin = await handlePluginRoute(
    runtime,
    request,
    response,
    decision.path,
  );
  if (handledByPlugin) {
    routeOutcome = "plugin";
    return;
  }
  runtime.logger.debug("route decision", { ...decision });
  if (decision.policy !== "intercept") {
    routeOutcome = "pass-through";
    proxyRequest(request, response, runtime.config, runtime.logger);
    return;
  }

  try {
    routeOutcome = "intercept";
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
    if (decision.path === GET_DEFAULT_MODEL_PATH) {
      await handleGetDefaultModel(runtime, request, response);
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
    if (
      decision.path === AUTH_FULL_STRIPE_PROFILE_PATH ||
      decision.path === AUTH_STRIPE_PROFILE_PATH
    ) {
      await handleAuthFullStripeProfile(runtime, request, response);
      return;
    }
    if (
      decision.path === AGENT_RUN_PATH ||
      decision.path === AGENT_RUN_SSE_PATH
    ) {
      await handleAgentRun(runtime, request, response, decision.path);
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
    if (decision.path === UPLOAD_ISSUE_TRACE_PATH) {
      await handleUploadIssueTrace(runtime, request, response);
      return;
    }
  } catch (error) {
    const handled = handleKnownRequestError(
      runtime,
      response,
      decision.path,
      error,
    );
    if (handled) {
      return;
    }
    runtime.logger.error("intercept failed", {
      path: decision.path,
      error: error instanceof Error ? error.message : String(error),
    });
    if (response.headersSent) {
      response.end(encodeEndStream({ error: "intercept failed" }));
      return;
    }
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

function authorizeRequest(
  runtime: BridgeRuntime,
  request: IncomingMessage,
  response: ServerResponse,
): boolean {
  const token = runtime.config.authToken;
  if (token === undefined) {
    return true;
  }
  const authorization = headerValue(request.headers.authorization);
  const bridgeToken = headerValue(request.headers["x-cursor-rpc-auth"]);
  const authorized =
    authorization === `Bearer ${token}` || bridgeToken === token;
  if (authorized) {
    return true;
  }
  response.writeHead(401, {
    "content-type": "application/json",
    "www-authenticate": "Bearer",
  });
  response.end(JSON.stringify({ error: "bridge authentication required" }));
  return false;
}

function handleKnownRequestError(
  runtime: BridgeRuntime,
  response: ServerResponse,
  pathName: string,
  error: unknown,
): boolean {
  if (error instanceof RequestBodyTooLargeError) {
    runtime.logger.warn("request body too large", {
      path: pathName,
      maxBytes: error.maxBytes,
    });
    writeErrorResponse(response, 413, "request body too large");
    return true;
  }
  if (error instanceof UpstreamRequestTimeoutError) {
    runtime.logger.warn("upstream request timed out", {
      path: pathName,
      timeoutMs: error.timeoutMs,
    });
    writeErrorResponse(response, 504, "upstream request timed out");
    return true;
  }
  return false;
}

function writeErrorResponse(
  response: ServerResponse,
  statusCode: number,
  message: string,
): void {
  if (response.headersSent) {
    response.end(encodeEndStream({ error: message }));
    return;
  }
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: message }));
}

function headerValue(value: string | string[] | undefined): string {
  if (value === undefined) {
    return "";
  }
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

function requestAbortSignal(
  request: IncomingMessage,
  response: ServerResponse,
): AbortSignal {
  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };
  request.once("aborted", abort);
  request.once("error", abort);
  response.once("close", () => {
    if (!response.writableEnded) {
      abort();
    }
  });
  return controller.signal;
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
    try {
      return await route.handle(request, response);
    } catch (error) {
      runtime.logger.error("plugin route failed", {
        path: route.path,
        error: error instanceof Error ? error.message : String(error),
      });
      if (!response.headersSent) {
        response.writeHead(502, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "plugin route failed" }));
      }
      return true;
    }
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
      try {
        await requestMiddleware.run(request);
      } catch (error) {
        runtime.logger.error("extension request middleware failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
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

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
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
  const format = await validatedRequestFormatOrPassThrough(
    runtime,
    request,
    response,
    body,
  );
  if (format === undefined) {
    return;
  }
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
  const merged = mergeAvailableModelsWithFallback(
    runtime,
    upstreamMessagePayload(upstreamBody, format),
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
  const format = await validatedRequestFormatOrPassThrough(
    runtime,
    request,
    response,
    body,
  );
  if (format === undefined) {
    return;
  }
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
  const merged = mergeUsableModelsWithFallback(
    runtime,
    upstreamMessagePayload(upstreamBody, format),
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
  const format = await validatedRequestFormatOrPassThrough(
    runtime,
    request,
    response,
    body,
  );
  if (format === undefined) {
    return;
  }
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
  const merged = mergeDefaultModelForCliWithFallback(
    runtime,
    upstreamMessagePayload(upstreamBody, format),
  );
  writeModelResponse(
    response,
    merged,
    runtime.logger,
    "served default CLI model",
    format,
  );
}

async function handleGetDefaultModel(
  runtime: BridgeRuntime,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body = await readRequestBody(
    request,
    runtime.config.maxInterceptBodyBytes,
  );
  const format = await validatedRequestFormatOrPassThrough(
    runtime,
    request,
    response,
    body,
  );
  if (format === undefined) {
    return;
  }
  const upstreamBody = await fetchUpstreamBuffer(
    request,
    body,
    runtime.config,
  ).catch((error: unknown) => {
    runtime.logger.warn("default model upstream unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  });
  const payload = mergeDefaultModel(
    upstreamMessagePayload(upstreamBody, format),
    runtime.models,
  );
  writeModelResponse(
    response,
    payload,
    runtime.logger,
    "served default model",
    format,
  );
}

async function handleNameAgent(
  runtime: BridgeRuntime,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body = await readRequestBody(
    request,
    runtime.config.maxInterceptBodyBytes,
  );
  const format = await validatedRequestFormatOrPassThrough(
    runtime,
    request,
    response,
    body,
  );
  if (format === undefined) {
    return;
  }
  writeModelResponse(
    response,
    buildLocalNameAgentResponse(),
    runtime.logger,
    "served local name agent",
    format,
  );
}

async function handleUploadIssueTrace(
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
  if (payload !== undefined) {
    try {
      const trace = fromBinary(UploadIssueTraceRequestSchema, payload);
      runtime.logger.warn("desktop issue trace uploaded", {
        payloadHash: trace.payloadHash,
        payloadChars: trace.payload.length,
        payloadPreview: summarizeIssueTracePayload(trace.payload),
      });
    } catch (error) {
      runtime.logger.warn("desktop issue trace decode failed", {
        error: error instanceof Error ? error.message : String(error),
        bytes: payload.length,
      });
    }
  }
  await proxyBufferedRequest(
    request,
    response,
    body,
    runtime.config,
    runtime.logger,
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
  const format = await validatedRequestFormatOrPassThrough(
    runtime,
    request,
    response,
    body,
  );
  if (format === undefined) {
    return;
  }
  const upstreamBody = await fetchUpstreamBuffer(
    request,
    body,
    runtime.config,
  ).catch((error: unknown) => {
    runtime.logger.warn("server config upstream unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  });
  const bridgeOrigin = agentRequestOrigin(request, runtime.config);
  const upstreamPayload = upstreamMessagePayload(upstreamBody, format);
  const payload = rewriteServerConfigWithFallback(
    runtime,
    upstreamPayload,
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

async function handleAuthFullStripeProfile(
  runtime: BridgeRuntime,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method === "OPTIONS") {
    response.writeHead(204, authProfileCorsHeaders(request));
    response.end();
    return;
  }
  const body = await readRequestBody(
    request,
    runtime.config.maxInterceptBodyBytes,
  );
  const upstreamBody = await fetchUpstreamBuffer(
    request,
    body,
    runtime.config,
  ).catch((error: unknown) => {
    runtime.logger.warn("auth profile upstream unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  });
  if (upstreamBody === undefined) {
    response.writeHead(502, { "content-type": "application/json" });
    response.end(
      JSON.stringify({ error: "auth profile upstream unavailable" }),
    );
    return;
  }
  if (upstreamBody.byteLength === 0) {
    response.writeHead(200, authProfileCorsHeaders(request));
    response.end(upstreamBody);
    return;
  }
  let profile: unknown;
  try {
    profile = JSON.parse(upstreamBody.toString("utf8")) as unknown;
  } catch (error) {
    runtime.logger.warn("auth profile JSON rewrite skipped", {
      error: error instanceof Error ? error.message : String(error),
      bytes: upstreamBody.byteLength,
    });
    response.writeHead(200, {
      ...authProfileCorsHeaders(request),
      "content-type": "application/octet-stream",
      "content-length": String(upstreamBody.byteLength),
    });
    response.end(upstreamBody);
    return;
  }
  const bridgeOrigin = agentRequestOrigin(request, runtime.config);
  const rewrites = rewriteAgentBackendUrlsInJson(profile, bridgeOrigin);
  const payload = Buffer.from(JSON.stringify(profile));
  response.writeHead(200, {
    ...authProfileCorsHeaders(request),
    "content-type": "application/json",
    "content-length": String(payload.byteLength),
  });
  response.end(payload);
  runtime.logger.info("served auth profile", { rewrites });
}

function rewriteAgentBackendUrlsInJson(
  value: unknown,
  agentOrigin: string,
): number {
  if (!isRecord(value)) {
    return 0;
  }
  let rewrites = 0;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string" && isCursorAgentBackendUrl(child)) {
      value[key] = agentOrigin;
      rewrites += 1;
      continue;
    }
    rewrites += rewriteAgentBackendUrlsInJson(child, agentOrigin);
  }
  if (
    "agentBackendUrlPrivacy" in value ||
    "agentBackendUrlNonPrivacy" in value
  ) {
    value.agentBackendUrlPrivacy = { default: agentOrigin };
    value.agentBackendUrlNonPrivacy = { default: agentOrigin };
    rewrites += 1;
  }
  return rewrites;
}

function isCursorAgentBackendUrl(value: string): boolean {
  return /^https:\/\/agent[a-z0-9.-]*\.cursor\.sh(?::\d+)?$/i.test(value);
}

function authProfileCorsHeaders(
  request: IncomingMessage,
): Record<string, string> {
  return {
    "access-control-allow-origin": request.headers.origin ?? "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers":
      request.headers["access-control-request-headers"] ??
      "authorization,content-type,x-cursor-checksum,x-cursor-client-version,x-cursor-timezone",
    "access-control-allow-credentials": "true",
    vary: "origin, access-control-request-headers",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rewriteServerConfigWithFallback(
  runtime: BridgeRuntime,
  upstreamPayload: Buffer | undefined,
  bridgeOrigin: string,
): Buffer {
  if (upstreamPayload === undefined) {
    return buildLocalServerConfig(bridgeOrigin);
  }
  try {
    return rewriteServerConfigAgentUrls(upstreamPayload, bridgeOrigin);
  } catch (error) {
    runtime.logger.warn("server config upstream decode failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return buildLocalServerConfig(bridgeOrigin);
  }
}

function requestOrigin(request: IncomingMessage, config: BridgeConfig): string {
  if (config.publicOrigin !== undefined) {
    return config.publicOrigin;
  }
  const host = request.headers.host ?? "127.0.0.1";
  return `${config.useTls ? "https" : "http"}://${host}`;
}

function agentRequestOrigin(
  request: IncomingMessage,
  config: BridgeConfig,
): string {
  return config.agentPublicOrigin ?? requestOrigin(request, config);
}

function summarizeIssueTracePayload(payload: string): string {
  const normalized = payload.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) {
    return "";
  }
  try {
    const parsed = JSON.parse(payload) as unknown;
    return JSON.stringify(summarizeIssueTraceJson(parsed)).slice(0, 4_000);
  } catch {
    return normalized.slice(0, 4_000);
  }
}

function summarizeIssueTraceJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => summarizeIssueTraceJson(item));
  }
  if (typeof value !== "object" || value === null) {
    return typeof value === "string" ? value.slice(0, 1_000) : value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/token|key|authorization|cookie|secret/i.test(key)) {
      result[key] = "<redacted>";
      continue;
    }
    result[key] = summarizeIssueTraceJson(entry);
  }
  return result;
}

function modelResponseFormatForRequest(
  request: IncomingMessage,
): ModelResponseFormat {
  const contentType = request.headers["content-type"];
  const value = Array.isArray(contentType) ? contentType[0] : contentType;
  return value?.includes("application/connect+proto") ? "connect" : "proto";
}

async function validatedRequestFormatOrPassThrough(
  runtime: BridgeRuntime,
  request: IncomingMessage,
  response: ServerResponse,
  body: Buffer,
): Promise<ModelResponseFormat | undefined> {
  const format = modelResponseFormatForRequest(request);
  if (requestPayloadForFormat(body, format) !== undefined) {
    return format;
  }
  await proxyBufferedRequest(
    request,
    response,
    body,
    runtime.config,
    runtime.logger,
  );
  return undefined;
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

function mergeAvailableModelsWithFallback(
  runtime: BridgeRuntime,
  upstreamPayload: Buffer | undefined,
): Buffer {
  try {
    return mergeAvailableModels(upstreamPayload, runtime.models);
  } catch (error) {
    runtime.logger.warn("available models upstream decode failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return mergeAvailableModels(undefined, runtime.models);
  }
}

function mergeUsableModelsWithFallback(
  runtime: BridgeRuntime,
  upstreamPayload: Buffer | undefined,
): Buffer {
  try {
    return mergeUsableModels(upstreamPayload, runtime.models);
  } catch (error) {
    runtime.logger.warn("usable models upstream decode failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return mergeUsableModels(undefined, runtime.models);
  }
}

function mergeDefaultModelForCliWithFallback(
  runtime: BridgeRuntime,
  upstreamPayload: Buffer | undefined,
): Buffer {
  try {
    return mergeDefaultModelForCli(upstreamPayload, runtime.models);
  } catch (error) {
    runtime.logger.warn("default CLI model upstream decode failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return mergeDefaultModelForCli(undefined, runtime.models);
  }
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

  await writeLocalChatResponse(response, decision, runtime.logger, {
    signal: requestAbortSignal(request, response),
  });
}

async function handleAgentRun(
  runtime: BridgeRuntime,
  request: IncomingMessage,
  response: ServerResponse,
  path: string,
): Promise<void> {
  const format = modelResponseFormatForRequest(request);
  if (
    path === AGENT_RUN_PATH &&
    format === "connect" &&
    (request.httpVersionMajor >= 2 ||
      request.headers["x-cursor-rpc-native-agent"] === "true")
  ) {
    await handleStreamingConnectAgentRun(runtime, request, response);
    return;
  }
  const { body, payloads } =
    format === "connect"
      ? await readStreamingConnectPayloadCandidates(
          request,
          runtime.config.maxInterceptBodyBytes,
        )
      : {
          body: await readRequestBody(
            request,
            runtime.config.maxInterceptBodyBytes,
          ),
          payloads: [] as Buffer[],
        };
  const candidates =
    format === "connect"
      ? payloads
      : requestPayloadCandidatesForFormat(body, format);
  if (candidates.length === 0) {
    await proxyBufferedRequest(
      request,
      response,
      body,
      runtime.config,
      runtime.logger,
    );
    return;
  }

  const requestId =
    path === AGENT_RUN_SSE_PATH
      ? getBidiRequestIdFromPayloads(candidates)
      : undefined;
  const decision =
    requestId === undefined
      ? getLocalAgentRunDecisionFromPayloads(candidates, runtime)
      : await waitForPendingAgentRun(
          runtime,
          requestId,
          requestAbortSignal(request, response),
        );
  if (decision === undefined) {
    runtime.logger.warn("agent run did not match local model", {
      path,
      payloads: candidates.length,
      descriptions: candidates.flatMap((payload) =>
        describeAgentRunPayload(payload),
      ),
    });
    if (format === "connect") {
      response.writeHead(502, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ error: "agent run did not match local model" }),
      );
      return;
    }
    await proxyBufferedRequest(
      request,
      response,
      body,
      runtime.config,
      runtime.logger,
    );
    return;
  }

  const traceId = newTraceId();
  emitTrace({
    event_type: "cursor.route",
    traceId,
    modelId: decision.model.id,
    payload: { message: "served local agent run", path, format },
  });
  const signal = requestAbortSignal(request, response);

  // Over the SSE + BidiAppend transport (the real cursor-agent CLI), drive the
  // same Cursor tool loop as the inline duplex path: ExecServerMessage frames go
  // out on this SSE response, and tool results arrive on later BidiAppend POSTs
  // routed into a per-request mailbox.
  const tools = cursorOpenAITools(runtime.config.agentToolPolicy);
  if (
    requestId !== undefined &&
    requestId.length > 0 &&
    tools.length > 0 &&
    decision.model.provider.streamCompletionEvents !== undefined
  ) {
    const mailbox = new ToolResultMailbox();
    runtime.toolResultMailboxes.set(requestId, mailbox);
    response.statusCode = 200;
    if (!response.headersSent) {
      response.setHeader("content-type", "application/connect+proto");
    }
    try {
      await writeLocalAgentRunResponseWithCursorTools(
        response,
        decision,
        runtime,
        mailbox.iterator(),
        signal,
      );
    } finally {
      mailbox.close();
      runtime.toolResultMailboxes.delete(requestId);
    }
    return;
  }

  await writeLocalAgentRunResponse(response, decision, runtime.logger, {
    signal,
    traceId,
  });
}

async function handleStreamingConnectAgentRun(
  runtime: BridgeRuntime,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  response.statusCode = 200;
  response.setHeader("content-type", "application/connect+proto");

  let pending: PendingAgentContextRun | undefined;
  const payloads = connectPayloadStream(
    request,
    Math.max(runtime.config.maxInterceptBodyBytes, MAX_AGENT_STREAM_BYTES),
  )[Symbol.asyncIterator]();
  while (true) {
    const next = await payloads.next();
    if (next.done === true) {
      break;
    }
    const payload = next.value;
    if (pending === undefined) {
      const decision = getLocalAgentRunDecisionFromPayloads([payload], runtime);
      if (decision === undefined) {
        continue;
      }
      if (!runtime.config.agentNativeContextEnabled) {
        runtime.logger.info("skipped native agent context", {
          model: decision.model.id,
        });
        await writeLocalAgentRunResponseWithCursorTools(
          response,
          decision,
          runtime,
          payloads,
          requestAbortSignal(request, response),
        );
        return;
      }
      pending = storePendingAgentContextRun(runtime, decision);
      response.write(createAgentRequestContextEnvelope(pending));
      continue;
    }

    const contextDecision = takePendingAgentContextRunFromPayloads(runtime, [
      payload,
    ]);
    if (contextDecision !== undefined) {
      await writeLocalAgentRunResponseWithCursorTools(
        response,
        contextDecision,
        runtime,
        payloads,
        requestAbortSignal(request, response),
      );
      return;
    }
  }

  if (pending !== undefined && !response.writableEnded) {
    runtime.pendingAgentContextRuns.delete(agentContextKey(pending));
  }
  if (!response.writableEnded) {
    response.writeHead(502, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "agent run stream ended early" }));
  }
}

async function writeLocalAgentRunResponseWithCursorTools(
  response: ServerResponse,
  decision: LocalAgentRunDecision,
  runtime: BridgeRuntime,
  payloads: AsyncIterator<Buffer>,
  signal: AbortSignal,
): Promise<void> {
  const traceId = newTraceId();
  emitTrace({
    event_type: "cursor.route",
    traceId,
    modelId: decision.model.id,
    payload: { message: "served local agent run (native context)" },
  });
  const streamEvents = decision.model.provider.streamCompletionEvents;
  if (streamEvents === undefined) {
    await writeLocalAgentRunResponse(response, decision, runtime.logger, {
      signal,
      traceId,
    });
    return;
  }

  const messages: ChatMessage[] = [...decision.messages];
  const tools = cursorOpenAITools(runtime.config.agentToolPolicy);
  const maxIterations = runtime.config.agentToolMaxIterations;
  let outputCharacters = 0;
  let toolIterations = 0;
  while (toolIterations < maxIterations) {
    let assistantContent = "";
    let requestedToolCalls: OpenAIToolCall[] = [];
    for await (const event of streamEvents.call(
      decision.model.provider,
      messages,
      tools,
      { signal, traceId },
    )) {
      if (event.type === "text") {
        outputCharacters += event.text.length;
        assistantContent += event.text;
        response.write(agentTextDeltaEnvelope(event.text));
      } else {
        requestedToolCalls = event.toolCalls;
      }
    }

    if (requestedToolCalls.length === 0) {
      response.write(agentTurnEndedEnvelope(outputCharacters));
      response.end(encodeEndStream());
      runtime.logger.info("served local agent run", {
        model: decision.model.id,
      });
      runtime.logger.info("local agent run diagnostics", {
        ...decision.diagnostics,
      });
      return;
    }

    toolIterations += 1;
    messages.push({
      role: "assistant",
      content: assistantContent,
      tool_calls: requestedToolCalls,
    });
    for (const toolCall of requestedToolCalls) {
      const toolResult = await executeCursorToolCall(
        response,
        runtime,
        payloads,
        toolCall,
        { signal },
      );
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolResult,
      });
    }
  }

  response.write(agentTextDeltaEnvelope("\n\nTool iteration limit reached."));
  response.write(agentTurnEndedEnvelope(outputCharacters));
  response.end(encodeEndStream());
}

function agentTextDeltaEnvelope(text: string): Buffer {
  return encodeEnvelope(
    toBinary(
      AgentServerMessageSchema,
      create(AgentServerMessageSchema, {
        interactionUpdate: create(InteractionUpdateSchema, {
          textDelta: create(TextDeltaUpdateSchema, { text }),
        }),
      }),
    ),
  );
}

function agentTurnEndedEnvelope(outputCharacters: number): Buffer {
  return encodeEnvelope(
    toBinary(
      AgentServerMessageSchema,
      create(AgentServerMessageSchema, {
        interactionUpdate: create(InteractionUpdateSchema, {
          turnEnded: create(TurnEndedUpdateSchema, {
            outputTokens: BigInt(Math.ceil(outputCharacters / 4)),
          }),
        }),
      }),
    ),
  );
}

function storePendingAgentContextRun(
  runtime: BridgeRuntime,
  decision: LocalAgentRunDecision,
): PendingAgentContextRun {
  pruneStalePendingAgentContextRuns(runtime);
  const id = runtime.nextAgentExecId;
  runtime.nextAgentExecId += 1;
  const pending: PendingAgentContextRun = {
    id,
    execId: `cursor-rpc-context-${String(id)}`,
    decision,
    createdAt: Date.now(),
  };
  runtime.pendingAgentContextRuns.set(agentContextKey(pending), pending);
  prunePendingMapToLimit(
    runtime.pendingAgentContextRuns,
    MAX_PENDING_AGENT_CONTEXT_RUNS,
  );
  runtime.logger.info("requested native agent context", {
    id: pending.id,
    execId: pending.execId,
    model: decision.model.id,
  });
  return pending;
}

function createAgentRequestContextEnvelope(
  pending: PendingAgentContextRun,
): Buffer {
  const payload = Buffer.from(
    toBinary(
      AgentServerMessageSchema,
      create(AgentServerMessageSchema, {
        execServerMessage: create(ExecServerMessageSchema, {
          id: pending.id,
          execId: pending.execId,
          requestContextArgs: create(RequestContextArgsSchema),
        }),
      }),
    ),
  );
  return encodeEnvelope(payload);
}

function takePendingAgentContextRunFromPayloads(
  runtime: BridgeRuntime,
  payloads: Buffer[],
): LocalAgentRunDecision | undefined {
  for (const payload of payloads) {
    let message: ReturnType<typeof fromBinary<typeof AgentClientMessageSchema>>;
    try {
      message = fromBinary(AgentClientMessageSchema, payload);
    } catch {
      continue;
    }
    const execMessage = message.execClientMessage;
    if (execMessage?.requestContextResult === undefined) {
      if (message.execClientMessage !== undefined) {
        runtime.logger.debug("agent exec client message ignored", {
          id: message.execClientMessage.id,
          execId: message.execClientMessage.execId,
          fields: agentExecClientMessageFields(message.execClientMessage),
        });
      }
      continue;
    }
    const keyed = agentContextKey({
      id: execMessage.id,
      execId: execMessage.execId,
    });
    const pending =
      runtime.pendingAgentContextRuns.get(keyed) ??
      firstPendingAgentContextRun(runtime);
    if (pending === undefined) {
      continue;
    }
    runtime.pendingAgentContextRuns.delete(agentContextKey(pending));
    const requestContext =
      execMessage.requestContextResult.success?.requestContext;
    if (requestContext === undefined) {
      runtime.logger.warn("native agent context unavailable", {
        id: execMessage.id,
        execId: execMessage.execId,
        error: execMessage.requestContextResult.error?.error,
        rejected: execMessage.requestContextResult.rejected?.reason,
      });
      return pending.decision;
    }
    runtime.logger.info("received native agent context", {
      id: execMessage.id,
      execId: execMessage.execId,
      rules: requestContext.rules.length + requestContext.nonFileRules.length,
      tools: requestContext.tools.length,
      fileContents: Object.keys(requestContext.fileContents).length,
      gitRepos: requestContext.gitRepos.length,
      projectLayouts: requestContext.projectLayouts.length,
    });
    return withNativeRequestContext(pending.decision, requestContext);
  }
  pruneStalePendingAgentContextRuns(runtime);
  return undefined;
}

function firstPendingAgentContextRun(
  runtime: BridgeRuntime,
): PendingAgentContextRun | undefined {
  return runtime.pendingAgentContextRuns.values().next().value as
    | PendingAgentContextRun
    | undefined;
}

function agentContextKey(value: { id: number; execId: string }): string {
  return `${value.execId}:${String(value.id)}`;
}

function pruneStalePendingAgentContextRuns(runtime: BridgeRuntime): void {
  const expiresBefore =
    Date.now() -
    (runtime.config.agentContextTimeoutMs ?? DEFAULT_AGENT_CONTEXT_TIMEOUT_MS);
  for (const [key, pending] of runtime.pendingAgentContextRuns) {
    if (pending.createdAt < expiresBefore) {
      runtime.pendingAgentContextRuns.delete(key);
    }
  }
}

function prunePendingMapToLimit<T extends { createdAt: number }>(
  pendingMap: Map<string, T>,
  limit: number,
): void {
  while (pendingMap.size > limit) {
    let oldestKey: string | undefined;
    let oldestCreatedAt = Number.POSITIVE_INFINITY;
    for (const [key, pending] of pendingMap) {
      if (pending.createdAt < oldestCreatedAt) {
        oldestKey = key;
        oldestCreatedAt = pending.createdAt;
      }
    }
    if (oldestKey === undefined) {
      return;
    }
    pendingMap.delete(oldestKey);
  }
}

function getLocalAgentRunDecisionFromPayloads(
  payloads: Buffer[],
  runtime: BridgeRuntime,
): LocalAgentRunDecision | undefined {
  for (const payload of payloads) {
    try {
      const decision = getLocalAgentRunDecision(payload, runtime.models);
      if (decision !== undefined) {
        return decision;
      }
    } catch {
      // Try the client-message wrapper below.
    }
    try {
      const decision = getLocalAgentRunDecisionFromClientMessage(
        payload,
        runtime.models,
      );
      if (decision !== undefined) {
        return decision;
      }
    } catch {
      // Keep scanning later frames.
    }
  }
  return undefined;
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

  // Tool-result append for an in-flight SSE agent run: deliver the
  // ExecClientMessage to the waiting tool loop instead of proxying upstream.
  if (
    decision === undefined &&
    requestId !== undefined &&
    requestId.length > 0 &&
    append !== undefined
  ) {
    const mailbox = runtime.toolResultMailboxes.get(requestId);
    if (mailbox !== undefined) {
      const toolResult = extractExecClientPayload(append);
      if (toolResult !== undefined) {
        mailbox.push(toolResult);
        writeModelResponse(
          response,
          Buffer.from(
            toBinary(
              BidiAppendResponseSchema,
              create(BidiAppendResponseSchema),
            ),
          ),
          runtime.logger,
          "served cursor tool result append",
          format,
        );
        return;
      }
    }
  }

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

  storePendingAgentRun(runtime, requestId, decision);
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

function getBidiRequestIdFromPayloads(
  payloads: Uint8Array[],
): string | undefined {
  for (const payload of payloads) {
    const requestId = getBidiRequestId(payload);
    if (requestId !== undefined) {
      return requestId;
    }
  }
  return undefined;
}

function requestPayloadForFormat(
  body: Buffer,
  format: ModelResponseFormat,
): Buffer | undefined {
  if (format === "proto") {
    return body;
  }
  try {
    const envelope = firstMessageEnvelope(body);
    if (envelope === undefined || isCompressedEnvelope(envelope)) {
      return undefined;
    }
    return envelope.payload;
  } catch {
    return undefined;
  }
}

function requestPayloadCandidatesForFormat(
  body: Buffer,
  format: ModelResponseFormat,
): Buffer[] {
  if (format === "proto") {
    return [body];
  }
  try {
    const framedPayloads = decodeEnvelopes(body)
      .filter((envelope) => !isEndStreamEnvelope(envelope))
      .flatMap((envelope) =>
        connectEnvelopePayloadCandidates(
          envelope.payload,
          isCompressedEnvelope(envelope),
        ),
      );
    return [body, ...framedPayloads];
  } catch {
    const payload = requestPayloadForFormat(body, format);
    return payload === undefined ? [body] : [body, payload];
  }
}

function connectEnvelopePayloadCandidates(
  payload: Buffer,
  compressed: boolean,
): Buffer[] {
  if (!compressed) {
    return [payload];
  }
  const candidates: Buffer[] = [];
  for (const decode of [
    zlib.gunzipSync,
    zlib.inflateSync,
    zlib.brotliDecompressSync,
  ]) {
    try {
      candidates.push(decode(payload));
    } catch {
      // Try the next compression format.
    }
  }
  return candidates;
}

async function readStreamingConnectPayloadCandidates(
  request: IncomingMessage,
  maxBytes: number,
): Promise<{ body: Buffer; payloads: Buffer[] }> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let resolved = false;

  return await new Promise((resolve, reject) => {
    let idleTimer: NodeJS.Timeout | undefined;
    const cleanup = () => {
      if (idleTimer !== undefined) {
        clearTimeout(idleTimer);
      }
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("error", onError);
    };
    const finish = () => {
      if (resolved) {
        return;
      }
      resolved = true;
      cleanup();
      const body = Buffer.concat(chunks, totalBytes);
      resolve({
        body,
        payloads: requestPayloadCandidatesForFormat(body, "connect"),
      });
    };
    const scheduleFinish = () => {
      if (idleTimer !== undefined) {
        clearTimeout(idleTimer);
      }
      idleTimer = setTimeout(finish, 100);
    };
    const onData = (chunk: Buffer) => {
      chunks.push(chunk);
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        cleanup();
        reject(new RequestBodyTooLargeError(maxBytes));
        return;
      }
      const parsed = parseEnvelopes(Buffer.concat(chunks, totalBytes));
      if (parsed.envelopes.some((envelope) => !isEndStreamEnvelope(envelope))) {
        scheduleFinish();
      }
    };
    const onEnd = () => finish();
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    request.on("data", onData);
    request.on("end", onEnd);
    request.on("error", onError);
  });
}

async function* connectPayloadStream(
  request: IncomingMessage,
  maxBytes: number,
): AsyncGenerator<Buffer> {
  let buffered = Buffer.alloc(0);
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > maxBytes) {
      throw new RequestBodyTooLargeError(maxBytes);
    }
    buffered = Buffer.concat(
      [buffered, buffer],
      buffered.length + buffer.length,
    );
    const parsed = parseEnvelopes(buffered);
    buffered = Buffer.from(parsed.remainder);
    for (const envelope of parsed.envelopes) {
      if (isEndStreamEnvelope(envelope)) {
        continue;
      }
      yield* connectEnvelopePayloadCandidates(
        envelope.payload,
        isCompressedEnvelope(envelope),
      );
    }
  }
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

function extractExecClientPayload(
  append: NonNullable<ReturnType<typeof fromBidiAppendPayload>>,
): Buffer | undefined {
  for (const candidate of bidiAppendClientPayloadCandidates(append)) {
    try {
      const message = fromBinary(AgentClientMessageSchema, candidate);
      if (message.execClientMessage !== undefined) {
        return Buffer.from(candidate);
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
  signal: AbortSignal,
): Promise<LocalAgentRunDecision | undefined> {
  const deadline =
    Date.now() +
    (runtime.config.agentRunSseWaitTimeoutMs ??
      DEFAULT_AGENT_RUN_SSE_WAIT_TIMEOUT_MS);
  while (Date.now() < deadline) {
    if (signal.aborted) {
      return undefined;
    }
    pruneStalePendingAgentRuns(runtime);
    const pending = runtime.pendingAgentRuns.get(requestId);
    if (pending !== undefined) {
      runtime.pendingAgentRuns.delete(requestId);
      return pending.decision;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  pruneStalePendingAgentRuns(runtime);
  return undefined;
}

function storePendingAgentRun(
  runtime: BridgeRuntime,
  requestId: string,
  decision: LocalAgentRunDecision,
): void {
  pruneStalePendingAgentRuns(runtime);
  runtime.pendingAgentRuns.set(requestId, {
    decision,
    createdAt: Date.now(),
  });
  prunePendingMapToLimit(runtime.pendingAgentRuns, MAX_PENDING_AGENT_RUNS);
}

function pruneStalePendingAgentRuns(runtime: BridgeRuntime): void {
  const expiresBefore =
    Date.now() -
    (runtime.config.agentRunSseWaitTimeoutMs ??
      DEFAULT_AGENT_RUN_SSE_WAIT_TIMEOUT_MS);
  for (const [key, pending] of runtime.pendingAgentRuns) {
    if (pending.createdAt < expiresBefore) {
      runtime.pendingAgentRuns.delete(key);
    }
  }
}
