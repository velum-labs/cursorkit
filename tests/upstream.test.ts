import http, { type IncomingMessage } from "node:http";
import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import type { BridgeConfig } from "../src/config.js";
import {
  fetchUpstreamBuffer,
  upstreamRequestOptions,
  upstreamRequestUrl,
} from "../src/upstream.js";

describe("upstreamRequestOptions", () => {
  it("connects to an override host while preserving Host and TLS SNI", () => {
    const request = {
      url: "/aiserver.v1.AiService/AvailableModels?x=1",
      headers: {
        host: "api2.cursor.sh",
        authorization: "Bearer local",
      },
    } as IncomingMessage;
    const options = upstreamRequestOptions(request, {
      ...baseConfig(),
      upstreamBaseUrl: "https://api2.cursor.sh",
      upstreamConnectHost: "203.0.113.10",
      upstreamConnectPort: 443,
    });

    expect(options.hostname).toBe("203.0.113.10");
    expect(options.port).toBe(443);
    expect(options.path).toBe("/aiserver.v1.AiService/AvailableModels?x=1");
    expect(options.servername).toBe("api2.cursor.sh");
    expect(options.headers).toMatchObject({
      host: "api2.cursor.sh",
      authorization: "Bearer local",
    });
  });

  it("preserves desktop request host for pass-through traffic", () => {
    const request = {
      url: "/agent.v1.AgentService/RunSSE",
      headers: {
        host: "agentn.global.api5.cursor.sh",
      },
    } as IncomingMessage;
    const config = {
      ...baseConfig(),
      desktopMode: true,
      upstreamBaseUrl: "https://api2.cursor.sh",
    };

    const upstreamUrl = upstreamRequestUrl(request, config);
    const options = upstreamRequestOptions(request, config, upstreamUrl);

    expect(upstreamUrl.toString()).toBe(
      "https://agentn.global.api5.cursor.sh/agent.v1.AgentService/RunSSE",
    );
    expect(options.servername).toBe("agentn.global.api5.cursor.sh");
    expect(options.headers).toMatchObject({
      host: "agentn.global.api5.cursor.sh",
    });
  });

  it("strips HTTP/2 pseudo-headers before upstream forwarding", () => {
    const request = {
      url: "/updates/check",
      headers: {
        ":method": "GET",
        ":path": "/updates/check",
        host: "api2.cursor.sh",
        authorization: "Bearer local",
      },
    } as unknown as IncomingMessage;

    const options = upstreamRequestOptions(request, {
      ...baseConfig(),
      desktopMode: true,
      upstreamBaseUrl: "https://api2.cursor.sh",
    });

    expect(options.headers).toMatchObject({
      host: "api2.cursor.sh",
      authorization: "Bearer local",
    });
    expect(options.headers).not.toHaveProperty(":method");
    expect(options.headers).not.toHaveProperty(":path");
  });

  it("decodes compressed upstream bodies for interceptors", async () => {
    const server = http.createServer((_request, response) => {
      response.writeHead(200, {
        "content-encoding": "gzip",
        "content-type": "application/proto",
      });
      response.end(gzipSync(Buffer.from("proto-payload")));
    });
    const port = await listen(server);
    try {
      const body = await fetchUpstreamBuffer(
        {
          method: "POST",
          url: "/aiserver.v1.AiService/AvailableModels",
          headers: {
            host: "api2.cursor.sh",
          },
        } as IncomingMessage,
        Buffer.from("request"),
        {
          ...baseConfig(),
          upstreamBaseUrl: `http://127.0.0.1:${port}`,
        },
      );

      expect(body?.toString("utf8")).toBe("proto-payload");
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });
});

async function listen(server: http.Server): Promise<number> {
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

function baseConfig(): BridgeConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    upstreamBaseUrl: undefined,
    upstreamConnectHost: undefined,
    upstreamConnectPort: undefined,
    desktopMode: false,
    modelBaseUrl: "http://localhost:8080/v1",
    modelApiKey: "",
    modelName: "local-model",
    models: [],
    captureDir: "fixtures/captures",
    captureEnabled: false,
    failOpen: true,
    logLevel: "error",
    maxInterceptBodyBytes: 1024 * 1024,
    publicOrigin: undefined,
    agentPublicOrigin: undefined,
    desktopAgentHttpPort: undefined,
    routeInventoryEnabled: false,
    modelPayloadLogging: "summary",
    agentToolMaxIterations: 8,
    agentToolPolicy: "safe",
    agentNativeContextEnabled: true,
    tlsHostnames: ["localhost", "127.0.0.1", "::1"],
    unsafeAllowNonLocalhost: false,
    useTls: false,
  };
}
