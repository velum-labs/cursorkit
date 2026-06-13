import http, {
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import https from "node:https";
import { pipeline } from "node:stream";

import type { BridgeConfig } from "./config.js";
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
  const headers = upstreamHeaders(request.headers, upstreamUrl);
  const client = upstreamUrl.protocol === "https:" ? https : http;
  const upstreamRequest = client.request(
    upstreamUrl,
    {
      method: request.method,
      headers,
    },
    (upstreamResponse) => {
      response.writeHead(
        upstreamResponse.statusCode ?? 502,
        upstreamResponse.statusMessage,
        responseHeaders(upstreamResponse.headers),
      );
      pipeline(upstreamResponse, response, (error) => {
        if (error !== null && !response.destroyed) {
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
  const upstreamUrl = upstreamRequestUrl(request, config);
  const upstreamResponse = await fetch(upstreamUrl, {
    method: request.method,
    headers: fetchHeaders(upstreamHeaders(request.headers, upstreamUrl)),
    body: body.length > 0 ? new Uint8Array(body) : undefined,
  });

  response.statusCode = upstreamResponse.status;
  for (const [key, value] of upstreamResponse.headers.entries()) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      response.setHeader(key, value);
    }
  }

  if (upstreamResponse.body === null) {
    response.end();
    return;
  }

  try {
    for await (const chunk of upstreamResponse.body as AsyncIterable<Uint8Array>) {
      response.write(chunk);
    }
    response.end();
  } catch (error) {
    logger.error("buffered upstream stream failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    response.destroy(error instanceof Error ? error : new Error(String(error)));
  }
}

export async function fetchUpstreamBuffer(
  request: IncomingMessage,
  body: Buffer,
  config: BridgeConfig,
): Promise<Buffer | undefined> {
  if (config.upstreamBaseUrl === undefined) {
    return undefined;
  }
  const upstreamUrl = upstreamRequestUrl(request, config);
  const response = await fetch(upstreamUrl, {
    method: request.method,
    headers: fetchHeaders(upstreamHeaders(request.headers, upstreamUrl)),
    body: body.length > 0 ? new Uint8Array(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`Upstream returned ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
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
  const upstreamBaseUrl = new URL(config.upstreamBaseUrl);
  return new URL(request.url ?? "/", upstreamBaseUrl);
}

function upstreamHeaders(
  headers: IncomingHttpHeaders,
  upstreamUrl: URL,
): Record<string, string | string[]> {
  const next: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (
      value === undefined ||
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
    if (value === undefined || HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      continue;
    }
    next[key] = value;
  }
  return next;
}

function fetchHeaders(headers: Record<string, string | string[]>): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        result.append(key, item);
      }
    } else {
      result.set(key, value);
    }
  }
  return result;
}
