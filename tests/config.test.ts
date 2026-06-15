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
    expect(config.agentNativeContextEnabled).toBe(true);
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

  it("allows non-localhost binds with auth or explicit unsafe mode", () => {
    expect(
      loadConfig({
        BRIDGE_HOST: "0.0.0.0",
        BRIDGE_AUTH_TOKEN: "local-secret",
      }),
    ).toMatchObject({
      host: "0.0.0.0",
      authToken: "local-secret",
      unsafeAllowNonLocalhost: false,
    });
    expect(
      loadConfig({
        BRIDGE_HOST: "0.0.0.0",
        BRIDGE_UNSAFE_ALLOW_NON_LOCALHOST: "true",
      }),
    ).toMatchObject({
      host: "0.0.0.0",
      unsafeAllowNonLocalhost: true,
    });
  });

  it("parses runtime reliability timeout knobs", () => {
    const config = loadConfig({
      BRIDGE_UPSTREAM_REQUEST_TIMEOUT_MS: "10",
      BRIDGE_AGENT_RUN_SSE_WAIT_TIMEOUT_MS: "20",
      BRIDGE_AGENT_CONTEXT_TIMEOUT_MS: "30",
      BRIDGE_AGENT_TOOL_RESULT_TIMEOUT_MS: "40",
      BRIDGE_EXTENSION_SETUP_TIMEOUT_MS: "50",
    });

    expect(config).toMatchObject({
      upstreamRequestTimeoutMs: 10,
      agentRunSseWaitTimeoutMs: 20,
      agentContextTimeoutMs: 30,
      toolResultTimeoutMs: 40,
      extensionSetupTimeoutMs: 50,
    });
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

  it("can disable native Cursor context explicitly", () => {
    const config = loadConfig({
      BRIDGE_AGENT_NATIVE_CONTEXT: "false",
    });

    expect(config.agentNativeContextEnabled).toBe(false);
  });

  it("rejects unknown local agent tool policies", () => {
    expect(() =>
      loadConfig({
        BRIDGE_AGENT_TOOL_POLICY: "danger",
      }),
    ).toThrow(/BRIDGE_AGENT_TOOL_POLICY/);
  });
});
