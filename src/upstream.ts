import http, {
  type RequestOptions,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import https from "node:https";
import { pipeline } from "node:stream";
import { promisify } from "node:util";
import { brotliDecompress, gunzip, inflate } from "node:zlib";

import type { BridgeConfig } from "./config.js";
import { DESKTOP_HOSTNAMES } from "./desktop.js";
import type { Logger } from "./logger.js";
import { redactHeaders } from "./redaction.js";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const gunzipAsync = promisify(gunzip);
const inflateAsync = promisify(inflate);
const brotliDecompressAsync = promisify(brotliDecompress);
const DEFAULT_UPSTREAM_REQUEST_TIMEOUT_MS = 120_000;

export class RequestBodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Request body exceeds limit of ${maxBytes} bytes`);
    this.name = "RequestBodyTooLargeError";
  }
}

export class UpstreamRequestTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Upstream request timed out after ${timeoutMs}ms`);
    this.name = "UpstreamRequestTimeoutError";
  }
}

export type UpstreamRequestOptions = RequestOptions & {
  servername?: string;
};

export async function readRequestBody(
  request: IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw new RequestBodyTooLargeError(maxBytes);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export function proxyRequest(
  request: IncomingMessage,
  response: ServerResponse,
  config: BridgeConfig,
  logger: Logger,
): void {
  const upstreamUrl = upstreamRequestUrl(request, config);
  const options = upstreamRequestOptions(request, config, upstreamUrl);
  const client = upstreamUrl.protocol === "https:" ? https : http;
  const timeoutMs =
    config.upstreamRequestTimeoutMs ?? DEFAULT_UPSTREAM_REQUEST_TIMEOUT_MS;
  let settled = false;
  const upstreamRequest = client.request(
    {
      ...options,
      method: request.method,
    },
    (upstreamResponse) => {
      response.writeHead(
        upstreamResponse.statusCode ?? 502,
        responseHeaders(upstreamResponse.headers),
      );
      pipeline(upstreamResponse, response, (error) => {
        if (error != null && !response.destroyed) {
          logger.warn("upstream response pipeline failed", {
            error: error.message,
          });
        }
      });
    },
  );

  upstreamRequest.on("error", (error) => {
    if (settled) {
      return;
    }
    settled = true;
    const timedOut = error instanceof UpstreamRequestTimeoutError;
    logger.error("upstream proxy request failed", {
      url: upstreamUrl.toString(),
      error: error.message,
      code: timedOut ? "upstream_timeout" : "upstream_request_failed",
      requestHeaders: redactHeaders(request.headers),
    });
    if (!response.headersSent && !response.destroyed) {
      response.writeHead(timedOut ? 504 : 502, {
        "content-type": "application/json",
      });
    }
    if (!response.destroyed) {
      response.end(
        JSON.stringify({
          error: timedOut
            ? "upstream request timed out"
            : "upstream request failed",
        }),
      );
    }
  });

  upstreamRequest.setTimeout(timeoutMs, () => {
    upstreamRequest.destroy(new UpstreamRequestTimeoutError(timeoutMs));
  });

  request.on("aborted", () => {
    upstreamRequest.destroy(new Error("client aborted request"));
  });

  request.on("error", (error) => {
    upstreamRequest.destroy(error);
  });
  response.on("close", () => {
    if (!response.writableEnded) {
      upstreamRequest.destroy(new Error("downstream response closed"));
    }
  });
  request.pipe(upstreamRequest);
}

export async function proxyBufferedRequest(
  request: IncomingMessage,
  response: ServerResponse,
  body: Buffer,
  config: BridgeConfig,
  logger: Logger,
): Promise<void> {
  const upstreamResponse = await requestUpstreamBuffer(request, body, config);

  response.statusCode = upstreamResponse.statusCode;
  for (const [key, value] of Object.entries(upstreamResponse.headers)) {
    if (value !== undefined && !HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      response.setHeader(key, value);
    }
  }

  response.end(upstreamResponse.body);
}

export async function fetchUpstreamBuffer(
  request: IncomingMessage,
  body: Buffer,
  config: BridgeConfig,
): Promise<Buffer | undefined> {
  if (config.upstreamBaseUrl === undefined) {
    return undefined;
  }
  const response = await requestUpstreamBuffer(request, body, config);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Upstream returned ${response.statusCode}`);
  }
  return decodeResponseBody(response.body, response.headers);
}

export function upstreamRequestUrl(
  request: IncomingMessage,
  config: BridgeConfig,
): URL {
  if (config.upstreamBaseUrl === undefined) {
    throw new Error(
      "CURSOR_UPSTREAM_BASE_URL is required for pass-through traffic",
    );
  }
  const requestHost = requestHostWithoutPort(request);
  const upstreamBaseUrl =
    config.desktopMode &&
    requestHost !== undefined &&
    DESKTOP_HOSTNAMES.includes(
      requestHost as (typeof DESKTOP_HOSTNAMES)[number],
    )
      ? new URL(`https://${requestHost}`)
      : new URL(config.upstreamBaseUrl);
  return new URL(request.url ?? "/", upstreamBaseUrl);
}

function requestHostWithoutPort(request: IncomingMessage): string | undefined {
  const host = request.headers.host;
  if (host === undefined) {
    return undefined;
  }
  const first = Array.isArray(host) ? host[0] : host;
  if (first === undefined || first.length === 0) {
    return undefined;
  }
  return first.split(":")[0];
}

export function upstreamRequestOptions(
  request: IncomingMessage,
  config: BridgeConfig,
  upstreamUrl = upstreamRequestUrl(request, config),
): UpstreamRequestOptions {
  const isHttps = upstreamUrl.protocol === "https:";
  return {
    protocol: upstreamUrl.protocol,
    hostname: config.upstreamConnectHost ?? upstreamUrl.hostname,
    port:
      config.upstreamConnectPort ??
      (upstreamUrl.port.length > 0 ? Number(upstreamUrl.port) : undefined),
    path: `${upstreamUrl.pathname}${upstreamUrl.search}`,
    headers: upstreamHeaders(request.headers, upstreamUrl),
    servername: isHttps ? upstreamUrl.hostname : undefined,
  };
}

async function requestUpstreamBuffer(
  request: IncomingMessage,
  body: Buffer,
  config: BridgeConfig,
): Promise<{
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}> {
  const upstreamUrl = upstreamRequestUrl(request, config);
  const options = upstreamRequestOptions(request, config, upstreamUrl);
  const client = upstreamUrl.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const timeoutMs =
      config.upstreamRequestTimeoutMs ?? DEFAULT_UPSTREAM_REQUEST_TIMEOUT_MS;
    let settled = false;
    const canObserveRequest =
      typeof request.on === "function" && typeof request.off === "function";
    const cleanup = () => {
      if (canObserveRequest) {
        request.off("aborted", onRequestAborted);
        request.off("error", onRequestError);
      }
    };
    const finish = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback();
    };
    let upstreamRequest: http.ClientRequest;
    const onRequestAborted = () => {
      upstreamRequest.destroy(new Error("client aborted request"));
    };
    const onRequestError = (error: Error) => {
      upstreamRequest.destroy(error);
    };
    upstreamRequest = client.request(
      {
        ...options,
        method: request.method,
      },
      (upstreamResponse) => {
        const chunks: Buffer[] = [];
        upstreamResponse.on("data", (chunk: Buffer) => chunks.push(chunk));
        upstreamResponse.on("end", () => {
          finish(() => {
            resolve({
              statusCode: upstreamResponse.statusCode ?? 502,
              headers: responseHeaders(upstreamResponse.headers),
              body: Buffer.concat(chunks),
            });
          });
        });
      },
    );
    upstreamRequest.on("error", (error) => {
      finish(() => reject(error));
    });
    upstreamRequest.setTimeout(timeoutMs, () => {
      upstreamRequest.destroy(new UpstreamRequestTimeoutError(timeoutMs));
    });
    if (canObserveRequest) {
      request.on("aborted", onRequestAborted);
      request.on("error", onRequestError);
    }
    upstreamRequest.end(body);
  });
}

function upstreamHeaders(
  headers: IncomingHttpHeaders,
  upstreamUrl: URL,
): Record<string, string | string[]> {
  const next: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (
      value === undefined ||
      key.startsWith(":") ||
      HOP_BY_HOP_HEADERS.has(key.toLowerCase()) ||
      key.toLowerCase() === "host"
    ) {
      continue;
    }
    next[key] = value;
  }
  next.host = upstreamUrl.host;
  return next;
}

function responseHeaders(
  headers: IncomingHttpHeaders,
): Record<string, string | string[]> {
  const next: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (
      value === undefined ||
      key.startsWith(":") ||
      HOP_BY_HOP_HEADERS.has(key.toLowerCase())
    ) {
      continue;
    }
    next[key] = value;
  }
  return next;
}

async function decodeResponseBody(
  body: Buffer,
  headers: IncomingHttpHeaders,
): Promise<Buffer> {
  const encodingHeader = headers["content-encoding"];
  const encoding = Array.isArray(encodingHeader)
    ? encodingHeader[0]
    : encodingHeader;
  switch (encoding?.toLowerCase()) {
    case undefined:
    case "":
    case "identity":
      return body;
    case "gzip":
    case "x-gzip":
      return gunzipAsync(body);
    case "deflate":
      return inflateAsync(body);
    case "br":
      return brotliDecompressAsync(body);
    default:
      return body;
  }
}
