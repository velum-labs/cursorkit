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
      throw new Error(`Request body exceeds limit of ${maxBytes} bytes`);
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
    logger.error("upstream proxy request failed", {
      url: upstreamUrl.toString(),
      error: error.message,
      requestHeaders: redactHeaders(request.headers),
    });
    if (!response.headersSent) {
      response.writeHead(502, { "content-type": "application/json" });
    }
    response.end(JSON.stringify({ error: "upstream request failed" }));
  });

  request.on("aborted", () => {
    upstreamRequest.destroy(new Error("client aborted request"));
  });

  request.on("error", (error) => {
    upstreamRequest.destroy(error);
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
    const upstreamRequest = client.request(
      {
        ...options,
        method: request.method,
      },
      (upstreamResponse) => {
        const chunks: Buffer[] = [];
        upstreamResponse.on("data", (chunk: Buffer) => chunks.push(chunk));
        upstreamResponse.on("end", () => {
          resolve({
            statusCode: upstreamResponse.statusCode ?? 502,
            headers: responseHeaders(upstreamResponse.headers),
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    upstreamRequest.on("error", reject);
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
