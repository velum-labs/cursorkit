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
}

export interface DesktopConnectProxy {
  server: net.Server;
  close(): Promise<void>;
}

export interface DesktopConnectProxyEvent {
  message: "desktop connect proxy";
  event: "listening" | "connect" | "http-rejected" | "upstream-error";
  host?: string;
  port?: number;
  targetHost?: string;
  targetPort?: number;
  cursorBackend?: boolean;
  error?: string;
}

const CONNECT_LINE_PATTERN = /^CONNECT\s+([^\s]+)\s+HTTP\/\d(?:\.\d)?$/i;

export async function startDesktopConnectProxy(
  options: DesktopConnectProxyOptions,
): Promise<DesktopConnectProxy> {
  const cursorHostnames = new Set(options.cursorHostnames ?? DESKTOP_HOSTNAMES);
  const passthrough = options.passthrough ?? true;
  const server = net.createServer((client) => {
    handleClient(client, options, cursorHostnames, passthrough);
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
): void {
  client.once("data", (chunk) => {
    const endOfHeaders = chunk.indexOf("\r\n\r\n");
    const headerBytes =
      endOfHeaders === -1 ? chunk : chunk.subarray(0, endOfHeaders + 4);
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

    const upstream = net.connect(targetPort, targetHost, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      const remaining =
        endOfHeaders === -1
          ? Buffer.alloc(0)
          : chunk.subarray(endOfHeaders + 4);
      if (remaining.length > 0) {
        upstream.write(remaining);
      }
      client.pipe(upstream);
      upstream.pipe(client);
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
    client.on("error", () => {
      upstream.destroy();
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
