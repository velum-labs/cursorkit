import net from "node:net";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { startDesktopConnectProxy } from "../src/desktopConnectProxy.js";

let servers: net.Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
  servers = [];
});

describe("desktop CONNECT proxy", () => {
  it("routes Cursor backend CONNECT tunnels to the local bridge", async () => {
    const bridge = await startEchoServer();
    const passthrough = await startEchoServer();
    const proxyPort = await freePort();
    const logPath = path.join(
      os.tmpdir(),
      `cursor-rpc-connect-${proxyPort}.log`,
    );
    const proxy = await startDesktopConnectProxy({
      host: "127.0.0.1",
      port: proxyPort,
      bridgeHost: "127.0.0.1",
      bridgePort: bridge.port,
      cursorHostnames: ["api2.cursor.sh"],
      logPath,
    });
    servers.push(proxy.server);

    const cursorResponse = await connectAndExchange(
      proxyPort,
      "api2.cursor.sh:443",
      "cursor",
    );
    const passthroughResponse = await connectAndExchange(
      proxyPort,
      `127.0.0.1:${passthrough.port}`,
      "other",
    );

    expect(cursorResponse).toBe("bridge:cursor");
    expect(passthroughResponse).toBe("passthrough:other");
  });

  it("handles split CONNECT headers and forwards buffered payload bytes", async () => {
    const bridge = await startEchoServer();
    const proxyPort = await freePort();
    const proxy = await startDesktopConnectProxy({
      host: "127.0.0.1",
      port: proxyPort,
      bridgeHost: "127.0.0.1",
      bridgePort: bridge.port,
      cursorHostnames: ["api2.cursor.sh"],
    });
    servers.push(proxy.server);

    const response = await connectWithWrites(proxyPort, [
      "CONNECT api2.cursor.sh:443 HTTP/1.1\r\nHost: api2",
      ".cursor.sh\r\n\r\nbuffered",
    ]);

    expect(response).toBe("bridge:buffered");
  });

  it("times out idle clients without opening an upstream tunnel", async () => {
    const bridge = await startEchoServer();
    const proxyPort = await freePort();
    const proxy = await startDesktopConnectProxy({
      host: "127.0.0.1",
      port: proxyPort,
      bridgeHost: "127.0.0.1",
      bridgePort: bridge.port,
      headerTimeoutMs: 10,
    });
    servers.push(proxy.server);

    const response = await connectWithWrites(proxyPort, []);

    expect(response).toContain("408 Request Timeout");
  });

  it("blocks non-Cursor CONNECT destinations when passthrough is disabled", async () => {
    const bridge = await startEchoServer();
    const passthrough = await startEchoServer();
    const proxyPort = await freePort();
    const proxy = await startDesktopConnectProxy({
      host: "127.0.0.1",
      port: proxyPort,
      bridgeHost: "127.0.0.1",
      bridgePort: bridge.port,
      cursorHostnames: ["api2.cursor.sh"],
      passthrough: false,
    });
    servers.push(proxy.server);

    const response = await connectWithWrites(proxyPort, [
      `CONNECT 127.0.0.1:${passthrough.port} HTTP/1.1\r\n\r\n`,
    ]);

    expect(response).toContain("502 Bad Gateway");
  });

  it("parses bracketed IPv6 CONNECT destinations", async () => {
    const bridge = await startEchoServer();
    const proxyPort = await freePort();
    const proxy = await startDesktopConnectProxy({
      host: "127.0.0.1",
      port: proxyPort,
      bridgeHost: "127.0.0.1",
      bridgePort: bridge.port,
      cursorHostnames: ["::1"],
      passthrough: false,
    });
    servers.push(proxy.server);

    const response = await connectAndExchange(proxyPort, "[::1]:443", "ipv6");

    expect(response).toBe("bridge:ipv6");
  });

  it("closes active upstream tunnels when the proxy closes", async () => {
    const bridge = await startHoldOpenServer();
    const proxyPort = await freePort();
    const proxy = await startDesktopConnectProxy({
      host: "127.0.0.1",
      port: proxyPort,
      bridgeHost: "127.0.0.1",
      bridgePort: bridge.port,
      cursorHostnames: ["api2.cursor.sh"],
    });

    const closed = new Promise<void>((resolve, reject) => {
      const socket = net.connect(proxyPort, "127.0.0.1", () => {
        socket.write("CONNECT api2.cursor.sh:443 HTTP/1.1\r\n\r\n");
      });
      socket.on("data", (chunk) => {
        if (chunk.toString("utf8").includes("200 Connection Established")) {
          void proxy.close();
        }
      });
      socket.on("close", () => resolve());
      socket.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "ECONNRESET") {
          resolve();
          return;
        }
        reject(error);
      });
    });

    await closed;
    await new Promise<void>((resolve) => bridge.server.close(() => resolve()));
  });
});

async function startEchoServer(): Promise<{ port: number; label: string }> {
  const label = servers.length === 0 ? "bridge" : "passthrough";
  const server = net.createServer((socket) => {
    socket.once("data", (chunk) => {
      socket.end(`${label}:${chunk.toString("utf8")}`);
    });
  });
  servers.push(server);
  const port = await listen(server);
  return { port, label };
}

async function connectAndExchange(
  proxyPort: number,
  destination: string,
  payload: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, "127.0.0.1", () => {
      socket.write(`CONNECT ${destination} HTTP/1.1\r\n\r\n`);
    });
    let data = "";
    let wrotePayload = false;
    socket.on("data", (chunk) => {
      data += chunk.toString("utf8");
      if (!wrotePayload && data.includes("\r\n\r\n")) {
        wrotePayload = true;
        socket.write(payload);
      }
    });
    socket.on("end", () => {
      resolve(data.split("\r\n\r\n").at(-1) ?? "");
    });
    socket.on("error", reject);
  });
}

async function connectWithWrites(
  proxyPort: number,
  writes: string[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, "127.0.0.1", () => {
      for (const write of writes) {
        socket.write(write);
      }
    });
    let data = "";
    const result = () =>
      data.includes("200 Connection Established")
        ? (data.split("\r\n\r\n").at(-1) ?? data)
        : data;
    socket.on("data", (chunk) => {
      data += chunk.toString("utf8");
    });
    socket.on("end", () => resolve(result()));
    socket.on("close", () => resolve(result()));
    socket.on("error", reject);
  });
}

async function startHoldOpenServer(): Promise<{
  port: number;
  server: net.Server;
}> {
  const server = net.createServer((socket) => {
    socket.on("error", () => undefined);
    socket.write("ready");
  });
  servers.push(server);
  const port = await listen(server);
  return { port, server };
}

async function freePort(): Promise<number> {
  const server = net.createServer();
  const port = await listen(server);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function listen(server: net.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("expected TCP address"));
        return;
      }
      resolve(address.port);
    });
  });
}
