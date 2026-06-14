import http from "node:http";
import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import type { BridgeConfig } from "../src/config.js";
import type { Logger } from "../src/logger.js";
import {
  attachRouteInventoryLogger,
  framingForContentType,
} from "../src/routeInventory.js";

describe("route inventory", () => {
  it("classifies request framing from content type", () => {
    expect(framingForContentType("application/connect+proto")).toBe(
      "connect-proto",
    );
    expect(framingForContentType("application/proto")).toBe("proto");
    expect(framingForContentType("application/json")).toBe("json");
    expect(framingForContentType(undefined)).toBe("none");
  });

  it("logs redacted desktop route metadata on response finish", async () => {
    const entries: Array<Record<string, unknown>> = [];
    const logger: Logger = {
      debug() {},
      info(_message, metadata) {
        entries.push(metadata ?? {});
      },
      warn() {},
      error() {},
    };
    const server = http.createServer((request, response) => {
      attachRouteInventoryLogger(
        { ...baseConfig(), routeInventoryEnabled: true },
        logger,
        request,
        response,
        {
          path: "/aiserver.v1.AiService/AvailableModels",
          policy: "intercept",
          reason: "test",
        },
        () => "intercept",
      );
      response.writeHead(200);
      response.end();
    });

    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const port = (server.address() as AddressInfo).port;
      await fetch(`http://127.0.0.1:${port}/x?token=secret`, {
        method: "POST",
        headers: { "content-type": "application/connect+proto" },
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    expect(entries[0]).toMatchObject({
      method: "POST",
      path: "/aiserver.v1.AiService/AvailableModels",
      contentType: "application/connect+proto",
      status: 200,
      framing: "connect-proto",
      policy: "intercept",
      outcome: "intercept",
    });
  });
});

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
    tlsHostnames: ["localhost", "127.0.0.1", "::1"],
    unsafeAllowNonLocalhost: false,
    useTls: false,
  };
}
