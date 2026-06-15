import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("keeps non-desktop defaults unchanged", () => {
    const config = loadConfig({ BRIDGE_PORT: "9443" });

    expect(config.desktopMode).toBe(false);
    expect(config.upstreamBaseUrl).toBeUndefined();
    expect(config.routeInventoryEnabled).toBe(false);
    expect(config.modelPayloadLogging).toBe("summary");
    expect(config.agentToolPolicy).toBe("safe");
    expect(config.tlsHostnames).toEqual(["localhost", "127.0.0.1", "::1"]);
  });

  it("applies desktop proxy defaults when enabled", () => {
    const config = loadConfig({
      BRIDGE_DESKTOP_MODE: "true",
      BRIDGE_PORT: "9443",
    });

    expect(config.desktopMode).toBe(true);
    expect(config.upstreamBaseUrl).toBe("https://api2.cursor.sh");
    expect(config.upstreamConnectHost).toBeUndefined();
    expect(config.publicOrigin).toBe("https://api2.cursor.sh");
    expect(config.routeInventoryEnabled).toBe(true);
    expect(config.tlsHostnames).toContain("api2.cursor.sh");
    expect(config.tlsHostnames).toContain("api3.cursor.sh");
  });

  it("parses custom TLS hostnames", () => {
    const config = loadConfig({
      BRIDGE_PORT: "9443",
      BRIDGE_TLS_HOSTNAMES: "api2.cursor.sh, localhost, 127.0.0.1",
    });

    expect(config.tlsHostnames).toEqual([
      "api2.cursor.sh",
      "localhost",
      "127.0.0.1",
    ]);
  });

  it("parses an upstream connect override separately from the logical upstream", () => {
    const config = loadConfig({
      BRIDGE_PORT: "9443",
      CURSOR_UPSTREAM_BASE_URL: "https://api2.cursor.sh",
      CURSOR_UPSTREAM_CONNECT_HOST: "203.0.113.10",
      CURSOR_UPSTREAM_CONNECT_PORT: "443",
    });

    expect(config.upstreamBaseUrl).toBe("https://api2.cursor.sh");
    expect(config.upstreamConnectHost).toBe("203.0.113.10");
    expect(config.upstreamConnectPort).toBe(443);
  });

  it("rejects non-localhost binds unless explicitly allowed", () => {
    expect(() => loadConfig({ BRIDGE_HOST: "0.0.0.0" })).toThrow(
      /Refusing to bind/,
    );
  });

  it("loads multiple local models from JSON", () => {
    const config = loadConfig({
      BRIDGE_MODELS_JSON: JSON.stringify([
        {
          id: "llama",
          displayName: "Llama",
          baseUrl: "http://localhost:11434/v1",
          contextTokenLimit: 4096,
        },
      ]),
    });

    expect(config.models).toHaveLength(1);
    expect(config.models[0]?.id).toBe("llama");
    expect(config.models[0]?.providerModel).toBe("llama");
  });

  it("separates Cursor-facing model id from provider model id", () => {
    const config = loadConfig({
      BRIDGE_MODELS_JSON: JSON.stringify([
        {
          id: "local-qwen",
          displayName: "local-qwen",
          providerModel: "mlx-community/Qwen3.5-4B-8bit",
          baseUrl: "http://localhost:8080/v1",
        },
      ]),
    });

    expect(config.models[0]).toMatchObject({
      id: "local-qwen",
      displayName: "local-qwen",
      providerModel: "mlx-community/Qwen3.5-4B-8bit",
    });
  });

  it("can enable full local model payload logging explicitly", () => {
    const config = loadConfig({
      BRIDGE_LOG_MODEL_PAYLOADS: "full",
    });

    expect(config.modelPayloadLogging).toBe("full");
  });

  it("can opt into all local agent tools explicitly", () => {
    const config = loadConfig({
      BRIDGE_AGENT_TOOL_POLICY: "all",
    });

    expect(config.agentToolPolicy).toBe("all");
  });

  it("rejects unknown local agent tool policies", () => {
    expect(() =>
      loadConfig({
        BRIDGE_AGENT_TOOL_POLICY: "danger",
      }),
    ).toThrow(/BRIDGE_AGENT_TOOL_POLICY/);
  });
});
