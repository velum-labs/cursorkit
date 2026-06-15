import fs from "node:fs";
import net from "node:net";

import { DESKTOP_HOSTNAMES } from "./desktop.js";

export interface DesktopConnectProxyOptions {
  host: string;
  port: number;
  bridgeHost: string;
  bridgePort: number;
  logPath?: string;
  passthrough?: boolean;
  cursorHostnames?: readonly string[];
  headerTimeoutMs?: number;
}

export interface DesktopConnectProxy {
  server: net.Server;
  close(): Promise<void>;
}

export interface DesktopConnectProxyEvent {
  message: "desktop connect proxy";
  event:
    | "listening"
    | "connect"
    | "http-rejected"
    | "passthrough-blocked"
    | "header-timeout"
    | "upstream-error"
    | "client-closed";
  host?: string;
  port?: number;
  targetHost?: string;
  targetPort?: number;
  cursorBackend?: boolean;
  error?: string;
}

const CONNECT_LINE_PATTERN = /^CONNECT\s+([^\s]+)\s+HTTP\/\d(?:\.\d)?$/i;
const DEFAULT_HEADER_TIMEOUT_MS = 5_000;
const MAX_CONNECT_HEADER_BYTES = 32 * 1024;

export async function startDesktopConnectProxy(
  options: DesktopConnectProxyOptions,
): Promise<DesktopConnectProxy> {
  const cursorHostnames = new Set(options.cursorHostnames ?? DESKTOP_HOSTNAMES);
  const passthrough = options.passthrough ?? true;
  const activeSockets = new Set<net.Socket>();
  const server = net.createServer((client) => {
    activeSockets.add(client);
    client.once("close", () => activeSockets.delete(client));
    handleClient(client, options, cursorHostnames, passthrough, activeSockets);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      server.off("error", reject);
      logProxyEvent(options.logPath, {
        message: "desktop connect proxy",
        event: "listening",
        host: options.host,
        port: options.port,
        targetHost: options.bridgeHost,
        targetPort: options.bridgePort,
      });
      resolve();
    });
  });

  return {
    server,
    close: () =>
      new Promise<void>((resolve, reject) => {
        for (const socket of activeSockets) {
          socket.destroy();
        }
        server.close((error) => {
          if (error !== undefined) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

function handleClient(
  client: net.Socket,
  options: DesktopConnectProxyOptions,
  cursorHostnames: Set<string>,
  passthrough: boolean,
  activeSockets: Set<net.Socket>,
): void {
  let upstream: net.Socket | undefined;
  let buffered = Buffer.alloc(0);
  let tunnelEstablished = false;
  const headerTimer = setTimeout(() => {
    logProxyEvent(options.logPath, {
      message: "desktop connect proxy",
      event: "header-timeout",
    });
    client.end("HTTP/1.1 408 Request Timeout\r\nConnection: close\r\n\r\n");
  }, options.headerTimeoutMs ?? DEFAULT_HEADER_TIMEOUT_MS);
  const cleanup = () => {
    clearTimeout(headerTimer);
    if (upstream !== undefined) {
      upstream.destroy();
    }
    if (tunnelEstablished) {
      logProxyEvent(options.logPath, {
        message: "desktop connect proxy",
        event: "client-closed",
      });
    }
  };
  client.once("close", cleanup);
  client.on("error", () => {
    upstream?.destroy();
  });

  client.on("data", function onData(chunk) {
    buffered = Buffer.concat([buffered, chunk]);
    if (buffered.length > MAX_CONNECT_HEADER_BYTES) {
      clearTimeout(headerTimer);
      client.off("data", onData);
      logProxyEvent(options.logPath, {
        message: "desktop connect proxy",
        event: "http-rejected",
        error: "connect header exceeded maximum size",
      });
      client.end(
        "HTTP/1.1 431 Request Header Fields Too Large\r\nConnection: close\r\n\r\n",
      );
      return;
    }
    const endOfHeaders = buffered.indexOf("\r\n\r\n");
    if (endOfHeaders === -1) {
      return;
    }
    clearTimeout(headerTimer);
    client.off("data", onData);
    const headerBytes = buffered.subarray(0, endOfHeaders + 4);
    const firstLine = headerBytes.toString("utf8").split("\r\n")[0] ?? "";
    const match = CONNECT_LINE_PATTERN.exec(firstLine);
    if (match === null) {
      logProxyEvent(options.logPath, {
        message: "desktop connect proxy",
        event: "http-rejected",
      });
      client.end(
        "HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n",
      );
      return;
    }

    const destination = parseConnectDestination(match[1]);
    const cursorBackend = cursorHostnames.has(destination.host);
    if (!cursorBackend && !passthrough) {
      logProxyEvent(options.logPath, {
        message: "desktop connect proxy",
        event: "passthrough-blocked",
        host: destination.host,
        port: destination.port,
      });
      client.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
      return;
    }

    const targetHost = cursorBackend ? options.bridgeHost : destination.host;
    const targetPort = cursorBackend ? options.bridgePort : destination.port;
    logProxyEvent(options.logPath, {
      message: "desktop connect proxy",
      event: "connect",
      host: destination.host,
      port: destination.port,
      targetHost,
      targetPort,
      cursorBackend,
    });

    upstream = net.connect(targetPort, targetHost, () => {
      if (upstream !== undefined) {
        activeSockets.add(upstream);
        upstream.once("close", () =>
          activeSockets.delete(upstream as net.Socket),
        );
      }
      tunnelEstablished = true;
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      const remaining = buffered.subarray(endOfHeaders + 4);
      if (remaining.length > 0) {
        upstream?.write(remaining);
      }
      if (upstream !== undefined) {
        client.pipe(upstream);
        upstream.pipe(client);
      }
    });
    upstream.on("error", (error) => {
      logProxyEvent(options.logPath, {
        message: "desktop connect proxy",
        event: "upstream-error",
        host: destination.host,
        port: destination.port,
        targetHost,
        targetPort,
        cursorBackend,
        error: error.message,
      });
      client.destroy(error);
    });
  });
}

function parseConnectDestination(value: string): {
  host: string;
  port: number;
} {
  if (value.startsWith("[")) {
    const closeBracket = value.indexOf("]");
    if (closeBracket !== -1) {
      const host = value.slice(1, closeBracket);
      const port = Number(value.slice(closeBracket + 2)) || 443;
      return { host, port };
    }
  }
  const [host, portText] = value.split(":");
  return { host: host ?? value, port: Number(portText ?? "443") || 443 };
}

function logProxyEvent(
  logPath: string | undefined,
  event: DesktopConnectProxyEvent,
): void {
  if (logPath === undefined) {
    return;
  }
  fs.appendFileSync(
    logPath,
    `${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`,
  );
}
