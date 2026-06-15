import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  analyzeRouteInventoryLog,
  bridgeProcessMatchesState,
  buildLocalDesktopModelEntry,
  buildCkRoutePlan,
  buildCkLaunchPlan,
  commandForDisplay,
  containsPrivilegedCommand,
  mergeLocalAgentBackendUrlsIntoApplicationUser,
  mergeLocalDesktopModelsIntoApplicationUser,
  parseCkArgs,
  routeInventoryTimeoutDiagnosis,
  runCk,
} from "../src/ckLauncher.js";

const originalCwd = process.cwd();
let tempDir: string | undefined;

afterEach(() => {
  vi.restoreAllMocks();
  process.chdir(originalCwd);
  if (tempDir !== undefined) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("ck launcher", () => {
  it("parses default, dry-run, and subcommands", () => {
    expect(parseCkArgs(["node", "ck"])).toEqual({
      command: "launch",
      dryRun: false,
      profileMode: "isolated",
      routeMethod: "pf",
      routeAction: "plan",
      timeoutMs: 15000,
    });
    expect(parseCkArgs(["node", "ck", "--print"])).toEqual({
      command: "launch",
      dryRun: true,
      profileMode: "isolated",
      routeMethod: "pf",
      routeAction: "plan",
      timeoutMs: 15000,
    });
    expect(parseCkArgs(["node", "ck", "--use-default-profile"])).toEqual({
      command: "launch",
      dryRun: false,
      profileMode: "default",
      routeMethod: "pf",
      routeAction: "plan",
      timeoutMs: 15000,
    });
    expect(parseCkArgs(["node", "ck", "--debug-port", "9333"])).toEqual({
      command: "launch",
      dryRun: false,
      profileMode: "isolated",
      routeMethod: "pf",
      routeAction: "plan",
      debugPort: 9333,
      timeoutMs: 15000,
    });
    expect(parseCkArgs(["node", "ck", "--instance-id", "ui-1"])).toEqual({
      command: "launch",
      dryRun: false,
      profileMode: "isolated",
      routeMethod: "pf",
      routeAction: "plan",
      instanceId: "ui-1",
      timeoutMs: 15000,
    });
    expect(parseCkArgs(["node", "ck", "--seed-auth-from-default"])).toEqual({
      command: "launch",
      dryRun: false,
      profileMode: "isolated",
      routeMethod: "pf",
      routeAction: "plan",
      seedAuthFromDefault: true,
      timeoutMs: 15000,
    });
    expect(parseCkArgs(["node", "ck", "--profile", "default"])).toEqual({
      command: "launch",
      dryRun: false,
      profileMode: "default",
      routeMethod: "pf",
      routeAction: "plan",
      timeoutMs: 15000,
    });
    expect(parseCkArgs(["node", "ck", "test", "--timeout-ms", "250"])).toEqual({
      command: "test",
      dryRun: false,
      profileMode: "isolated",
      routeMethod: "pf",
      routeAction: "plan",
      timeoutMs: 250,
    });
    expect(parseCkArgs(["node", "ck", "--timeout-ms", "250", "test"])).toEqual({
      command: "test",
      dryRun: false,
      profileMode: "isolated",
      routeMethod: "pf",
      routeAction: "plan",
      timeoutMs: 250,
    });
    expect(
      parseCkArgs(["node", "ck", "test", "--use-default-profile"]),
    ).toEqual({
      command: "test",
      dryRun: false,
      profileMode: "default",
      routeMethod: "pf",
      routeAction: "plan",
      timeoutMs: 15000,
    });
    expect(parseCkArgs(["node", "ck", "route"])).toEqual({
      command: "route",
      dryRun: false,
      profileMode: "isolated",
      routeMethod: "pf",
      routeAction: "plan",
      timeoutMs: 15000,
    });
    expect(parseCkArgs(["node", "ck", "route", "status"])).toEqual({
      command: "route",
      dryRun: false,
      profileMode: "isolated",
      routeMethod: "pf",
      routeAction: "status",
      timeoutMs: 15000,
    });
    expect(parseCkArgs(["node", "ck", "route", "rollback"])).toEqual({
      command: "route",
      dryRun: false,
      profileMode: "isolated",
      routeMethod: "pf",
      routeAction: "rollback",
      timeoutMs: 15000,
    });
    expect(parseCkArgs(["node", "ck", "route", "--method", "direct"])).toEqual({
      command: "route",
      dryRun: false,
      profileMode: "isolated",
      routeMethod: "direct",
      routeAction: "plan",
      timeoutMs: 15000,
    });
    expect(() => parseCkArgs(["node", "ck", "--timeout-ms", "nope"])).toThrow(
      "--timeout-ms",
    );
    expect(() => parseCkArgs(["node", "ck", "--profile", "weird"])).toThrow(
      "--profile",
    );
    expect(() => parseCkArgs(["node", "ck", "--debug-port", "nope"])).toThrow(
      "--debug-port",
    );
    expect(() => parseCkArgs(["node", "ck", "--instance-id", "../x"])).toThrow(
      "--instance-id",
    );
    expect(() =>
      parseCkArgs(["node", "ck", "route", "--method", "weird"]),
    ).toThrow("--method");
    expect(() => parseCkArgs(["node", "ck", "route", "weird"])).toThrow(
      "subcommand",
    );
    expect(parseCkArgs(["node", "ck", "doctor"])).toEqual({
      command: "doctor",
      dryRun: false,
      profileMode: "isolated",
      routeMethod: "pf",
      routeAction: "plan",
      timeoutMs: 15000,
    });
    expect(parseCkArgs(["node", "ck", "cert"])).toEqual({
      command: "cert",
      dryRun: false,
      profileMode: "isolated",
      routeMethod: "pf",
      routeAction: "plan",
      timeoutMs: 15000,
    });
    expect(parseCkArgs(["node", "ck", "stop"])).toEqual({
      command: "stop",
      dryRun: false,
      profileMode: "isolated",
      routeMethod: "pf",
      routeAction: "plan",
      timeoutMs: 15000,
    });
  });

  it("builds desktop model entries with bridge-compatible variants", () => {
    const entry = buildLocalDesktopModelEntry({
      id: "local-qwen",
      displayName: "local-qwen",
      providerModel: "mlx-community/Qwen3.5-4B-8bit",
      baseUrl: "http://127.0.0.1:8080/v1",
      apiKey: "local",
      contextTokenLimit: 128000,
    });

    expect(entry).toMatchObject({
      name: "local-qwen",
      serverModelName: "local-qwen",
      supportsAgent: true,
      supportsMaxMode: true,
      parameterDefinitions: [
        expect.objectContaining({ id: "context", name: "Context" }),
        expect.objectContaining({ id: "reasoning", name: "Reasoning" }),
        expect.objectContaining({ id: "fast", name: "Fast" }),
      ],
    });
    expect(entry.variants).toHaveLength(2);
    expect(entry.variants).toEqual([
      expect.objectContaining({
        isMaxMode: false,
        isDefaultNonMaxConfig: true,
        parameterValues: [
          { id: "context", value: "272k" },
          { id: "reasoning", value: "medium" },
          { id: "fast", value: "false" },
        ],
        variantStringRepresentation:
          "local-qwen[context=272k,reasoning=medium,fast=false]",
        legacySlug: "local-qwen",
      }),
      expect.objectContaining({
        isMaxMode: true,
        isDefaultMaxConfig: true,
        parameterValues: [
          { id: "context", value: "1m" },
          { id: "reasoning", value: "medium" },
          { id: "fast", value: "false" },
        ],
        variantStringRepresentation:
          "local-qwen[context=1m,reasoning=medium,fast=false]",
        legacySlug: "local-qwen",
      }),
    ]);
  });

  it("removes stale seeded local desktop catalog entries and seeds preferences", () => {
    const applicationUser: Record<string, unknown> = {
      availableDefaultModels2: [
        {
          name: "local-qwen",
          variants: [{ variantStringRepresentation: "local-qwen[]" }],
        },
        { name: "gpt-5.5" },
      ],
      aiSettings: {
        userAddedModels: [],
        modelOverrideEnabled: [],
        modelOverrideDisabled: ["local-qwen"],
        modelParameterPreferences: {
          "local-qwen": {
            modelId: "local-qwen",
            parameters: [],
          },
        },
      },
    };

    mergeLocalDesktopModelsIntoApplicationUser(applicationUser, [
      {
        id: "local-qwen",
        displayName: "local-qwen",
        providerModel: "mlx-community/Qwen3.5-4B-8bit",
        baseUrl: "http://127.0.0.1:8080/v1",
        apiKey: "local",
        contextTokenLimit: 128000,
      },
    ]);

    expect(applicationUser.availableDefaultModels2).toEqual([
      { name: "gpt-5.5" },
    ]);
    expect(applicationUser.aiSettings).toMatchObject({
      userAddedModels: ["local-qwen"],
      modelOverrideEnabled: ["local-qwen"],
      modelOverrideDisabled: [],
      modelParameterPreferences: {
        "local-qwen": {
          modelId: "local-qwen",
          parameters: [
            { id: "context", value: "1m" },
            { id: "reasoning", value: "medium" },
            { id: "fast", value: "false" },
          ],
        },
      },
      modelConfig: {
        composer: {
          modelName: "local-qwen",
          maxMode: true,
          selectedModels: [
            {
              modelId: "local-qwen",
              parameters: [
                { id: "context", value: "1m" },
                { id: "reasoning", value: "medium" },
                { id: "fast", value: "false" },
              ],
            },
          ],
        },
        "background-composer": {
          modelName: "local-qwen",
          maxMode: true,
          selectedModels: [
            {
              modelId: "local-qwen",
              parameters: [
                { id: "context", value: "1m" },
                { id: "reasoning", value: "medium" },
                { id: "fast", value: "false" },
              ],
            },
          ],
        },
      },
    });
    expect(applicationUser).toMatchObject({
      useOpenAIKey: true,
      openAIBaseUrl: "http://127.0.0.1:8080/v1",
      openAIKey: "local",
    });
  });

  it("rewrites seeded Cursor Agent backend URLs to the local bridge", () => {
    const applicationUser: Record<string, unknown> = {
      cursorCreds: {
        agentBackendUrlPrivacy: { default: "https://agent.api5.cursor.sh" },
        agentBackendUrlNonPrivacy: {
          default: "https://agentn.global.api5.cursor.sh",
        },
      },
    };

    mergeLocalAgentBackendUrlsIntoApplicationUser(
      applicationUser,
      "http://127.0.0.1:50505",
    );

    expect(applicationUser.cursorCreds).toMatchObject({
      agentBackendUrlPrivacy: { default: "http://127.0.0.1:50505" },
      agentBackendUrlNonPrivacy: { default: "http://127.0.0.1:50505" },
    });
  });

  it("builds desktop bridge and isolated Cursor commands", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-rpc-ck-"));
    const plan = buildCkLaunchPlan({
      cwd: tempDir,
      bridgePort: 9555,
      connectProxyPort: 9666,
      agentHttpPort: 9777,
      env: {
        BRIDGE_LOG_LEVEL: "trace",
        MODEL_NAME: "local-qwen",
        MODEL_PROVIDER_MODEL: "mlx-community/Qwen3.5-4B-8bit",
        BRIDGE_MODELS_JSON: "[]",
        MODEL_API_KEY: "secret",
        SECRET_TOKEN: "do-not-print",
      },
    });

    expect(plan.bridge.env).toMatchObject({
      BRIDGE_DESKTOP_MODE: "true",
      BRIDGE_USE_TLS: "true",
      BRIDGE_PORT: "9555",
      BRIDGE_LOG_LEVEL: "trace",
      MODEL_NAME: "local-qwen",
      MODEL_PROVIDER_MODEL: "mlx-community/Qwen3.5-4B-8bit",
      BRIDGE_MODELS_JSON: "[]",
      MODEL_API_KEY: "secret",
      CURSOR_UPSTREAM_BASE_URL: "https://api2.cursor.sh",
      BRIDGE_DESKTOP_AGENT_HTTP_PORT: "9777",
      BRIDGE_AGENT_PUBLIC_ORIGIN: "https://127.0.0.1:9555",
    });
    expect(plan.bridge.env).not.toHaveProperty("SECRET_TOKEN");
    expect(plan.cursor.executable).toBe(
      "/Applications/Cursor.app/Contents/MacOS/Cursor",
    );
    expect(plan.cursor.args).toContain(tempDir);
    expect(plan.workspacePath).toBe(tempDir);
    expect(plan.cursor.args).toContain("--proxy-server=http://127.0.0.1:9666");
    expect(plan.cursor.args).toContain(
      "--proxy-bypass-list=<-loopback>;localhost;127.0.0.1",
    );
    expect(
      plan.cursor.args.some((arg) => arg.startsWith("--host-resolver-rules=")),
    ).toBe(true);
    expect(plan.cursor.args).toContain("--ignore-certificate-errors");
    expect(plan.cursor.env).toMatchObject({
      HTTP_PROXY: "http://127.0.0.1:9666",
      HTTPS_PROXY: "http://127.0.0.1:9666",
      ALL_PROXY: "http://127.0.0.1:9666",
      NO_PROXY: "127.0.0.1,localhost,::1",
    });
    expect(plan.connectProxyPort).toBe(9666);
    expect(plan.agentHttpPort).toBe(9777);
    expect(plan.connectProxyLogPath).toBe(
      path.join(tempDir, ".cursor-rpc", "ck", "connect-proxy.log"),
    );
    expect(plan.userDataDir).toBe(
      path.join(tempDir, ".cursor-rpc", "ck", "user-data"),
    );
    expect(plan.extensionsDir).toBe(
      path.join(tempDir, ".cursor-rpc", "ck", "extensions"),
    );
    expect(plan.logPath).toBe(
      path.join(tempDir, ".cursor-rpc", "ck", "bridge.log"),
    );
  });

  it("can build a default-profile Cursor command for auth-sensitive testing", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-rpc-ck-"));
    const plan = buildCkLaunchPlan({
      cwd: tempDir,
      bridgePort: 9555,
      profileMode: "default",
      env: {},
    });

    expect(plan.profileMode).toBe("default");
    expect(plan.userDataDir).toBeUndefined();
    expect(
      plan.cursor.args.some((arg) => arg.startsWith("--user-data-dir=")),
    ).toBe(false);
    expect(plan.cursor.args).toContain(
      `--extensions-dir=${path.join(tempDir, ".cursor-rpc", "ck", "extensions")}`,
    );
  });

  it("can launch Cursor with a remote debugging port", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-rpc-ck-"));
    const plan = buildCkLaunchPlan({
      cwd: tempDir,
      bridgePort: 9555,
      debugPort: 9333,
      env: {},
    });

    expect(plan.debugPort).toBe(9333);
    expect(plan.cursor.args).toContain("--remote-debugging-port=9333");
  });

  it("can build an isolated named ck instance", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-rpc-ck-"));
    const plan = buildCkLaunchPlan({
      cwd: tempDir,
      bridgePort: 9555,
      instanceId: "ui-test",
      env: {},
    });

    expect(plan.instanceId).toBe("ui-test");
    expect(plan.stateDir).toBe(
      path.join(tempDir, ".cursor-rpc", "ck", "ui-test"),
    );
    expect(plan.userDataDir).toBe(
      path.join(tempDir, ".cursor-rpc", "ck", "ui-test", "user-data"),
    );
  });

  it("prints dry-run commands without generating cert files", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-rpc-ck-"));
    process.chdir(tempDir);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runCk(["node", "ck", "--print"]);

    const output = log.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("Bridge:");
    expect(output).toContain("Cursor:");
    expect(output).toContain("--proxy-server=http://127.0.0.1:");
    expect(output).toContain("BRIDGE_DESKTOP_MODE=true");
    expect(output).not.toContain("secret");
    expect(output).toContain("Log:");
    expect(fs.existsSync(path.join(tempDir, ".cursor-rpc", "certs"))).toBe(
      false,
    );
  });

  it("analyzes route inventory logs for model-route coverage", () => {
    const report = analyzeRouteInventoryLog(
      [
        JSON.stringify({
          message: "desktop route inventory",
          method: "POST",
          path: "/aiserver.v1.AiService/AvailableModels",
          contentType: "application/connect+proto",
          status: 200,
          framing: "connect-proto",
          policy: "intercept",
          outcome: "intercept",
        }),
        JSON.stringify({
          message: "desktop route inventory",
          method: "POST",
          path: "/some.other.Route/Call",
          contentType: "application/proto",
          status: 200,
          framing: "proto",
          policy: "pass-through",
          outcome: "pass-through",
        }),
        JSON.stringify({
          message: "desktop route inventory",
          method: "POST",
          path: "/some.other.Route/Broken",
          contentType: "application/json",
          status: 502,
          framing: "json",
          policy: "pass-through",
          outcome: "pass-through",
        }),
      ].join("\n"),
    );

    expect(report.routeInventorySeen).toBe(true);
    expect(report.modelRoutesSeen).toEqual([
      "/aiserver.v1.AiService/AvailableModels",
    ]);
    expect(report.missingModelRoutes).toEqual([
      "/aiserver.v1.AiService/GetUsableModels",
      "/aiserver.v1.AiService/GetDefaultModelForCli",
    ]);
    expect(report.failedRoutes).toHaveLength(1);
    expect(report.passThroughRoutes).toHaveLength(2);
    expect(report.routeCategories).toEqual([
      {
        path: "/aiserver.v1.AiService/AvailableModels",
        category: "model-metadata",
        reason: "known model-list/default-model route",
      },
      {
        path: "/some.other.Route/Broken",
        category: "pass-through",
        reason: "observed but intentionally forwarded upstream",
      },
      {
        path: "/some.other.Route/Call",
        category: "pass-through",
        reason: "observed but intentionally forwarded upstream",
      },
    ]);
    expect(report.routeSummary).toContainEqual({
      path: "/aiserver.v1.AiService/AvailableModels",
      count: 1,
      methods: ["POST"],
      statuses: [200],
      framings: ["connect-proto"],
      policies: ["intercept"],
      outcomes: ["intercept"],
    });
    expect(report.diagnosis.join("\n")).toContain("at least one known");
    expect(report.diagnosis.join("\n")).toContain("passed through to upstream");
  });

  it("diagnoses missing desktop route inventory", () => {
    const report = analyzeRouteInventoryLog("");

    expect(report.routeInventorySeen).toBe(false);
    expect(report.modelRoutesSeen).toEqual([]);
    expect(report.diagnosis).toEqual(routeInventoryTimeoutDiagnosis());
  });

  it("detects privileged commands while allowing launcher commands", () => {
    const plan = buildCkLaunchPlan({
      bridgePort: 9555,
      env: {},
    });

    expect(containsPrivilegedCommand(plan.bridge)).toBe(false);
    expect(containsPrivilegedCommand(plan.cursor)).toBe(false);
    expect(
      containsPrivilegedCommand({
        executable: "sudo",
        args: ["security", "add-trusted-cert"],
      }),
    ).toBe(true);
    expect(
      containsPrivilegedCommand({
        executable: "pfctl",
        args: ["-f", "rules.conf"],
      }),
    ).toBe(true);
    expect(
      containsPrivilegedCommand({
        executable: "sh",
        args: ["-c", "echo 127.0.0.1 api2.cursor.sh >> /etc/hosts"],
      }),
    ).toBe(true);
  });

  it("returns a clear route-inventory timeout diagnosis", () => {
    expect(routeInventoryTimeoutDiagnosis()).toEqual([
      "No desktop route inventory observed yet. Per-instance routing may not affect this Cursor network path.",
      "Run `pnpm ck route` to print manual fallback routing and rollback commands.",
    ]);
  });

  it("matches ck-owned bridge processes before stopping stale state PIDs", () => {
    expect(
      bridgeProcessMatchesState("node /repo/dist/src/cli.js desktop-proxy", {}),
    ).toBe(true);
    expect(
      bridgeProcessMatchesState("node /tmp/server.js", {
        bridgeCommand: "node /repo/dist/src/cli.js desktop-proxy",
      }),
    ).toBe(false);
    expect(
      bridgeProcessMatchesState("node /repo/dist/src/cli.js desktop-proxy", {
        bridgeCommand: "node /repo/dist/src/cli.js desktop-proxy",
      }),
    ).toBe(true);
  });

  it("builds non-mutating desktop route plans", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-rpc-ck-"));
    const plan = await buildCkRoutePlan({
      cwd: tempDir,
      method: "pf",
      bridgePort: 9443,
      upstreamConnectHost: "1.2.3.4",
    });

    expect(plan.method).toBe("pf");
    expect(plan.upstreamConnectHost).toBe("1.2.3.4");
    expect(plan.setupCommands.map(commandForDisplay).join("\n")).toContain(
      "CURSOR_UPSTREAM_CONNECT_HOST=1.2.3.4",
    );
    expect(plan.setupCommands.some(containsPrivilegedCommand)).toBe(true);
    expect(plan.rollbackCommands.some(containsPrivilegedCommand)).toBe(true);
    expect(
      plan.verificationCommands.map(commandForDisplay).join("\n"),
    ).toContain("pnpm ck test --use-default-profile");
  });

  it("quotes displayed commands safely", () => {
    expect(
      commandForDisplay({
        executable: "/usr/bin/open",
        args: ["--user-data-dir=/tmp/with space"],
      }),
    ).toContain("'--user-data-dir=/tmp/with space'");
  });
});
