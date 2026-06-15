import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FileArtifactStore,
  createRunDirectory,
  writeRunSummary,
} from "../src/testing/artifacts.js";
import { parseHarnessArgs } from "../src/testing/cli.js";
import { probeLocalBackend } from "../src/testing/localBackend.js";
import { expandSuites } from "../src/testing/runner.js";
import { desktopUiCkArgs } from "../src/testing/scenarios.js";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir !== undefined) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("testing harness", () => {
  it("parses harness arguments with MLX defaults and suite aliases", () => {
    const options = parseHarnessArgs(
      [
        "node",
        "harness",
        "--",
        "--suite",
        "local-backend,desktop,traffic",
        "--base-url",
        "http://127.0.0.1:8080/v1",
        "--model",
        "mlx-community/Qwen3.5-4B-8bit",
        "--display-name",
        "local-qwen",
        "--api-key",
        "local",
        "--timeout-ms",
        "1234",
        "--use-default-profile",
        "--include-experimental",
      ],
      {},
      "/tmp/repo",
    );

    expect(options.suites).toEqual(["local-backend", "desktop", "traffic"]);
    expect(options.baseUrl).toBe("http://127.0.0.1:8080/v1");
    expect(options.model).toBe("mlx-community/Qwen3.5-4B-8bit");
    expect(options.displayName).toBe("local-qwen");
    expect(options.apiKey).toBe("local");
    expect(options.timeoutMs).toBe(1234);
    expect(options.useDefaultProfile).toBe(true);
    expect(options.includeExperimental).toBe(true);
  });

  it("expands suite aliases predictably", () => {
    expect(
      expandSuites(["all"], {
        includeExperimental: false,
      }),
    ).toEqual(["static", "bridge-protocol", "cursor-agent"]);
    expect(
      expandSuites(["cli", "desktop"], {
        includeExperimental: false,
      }),
    ).toEqual(["cursor-agent", "desktop-route"]);
    expect(
      expandSuites(["traffic"], {
        includeExperimental: false,
      }),
    ).toEqual(["cursor-agent-traffic"]);
    expect(
      expandSuites(["acp"], {
        includeExperimental: false,
      }),
    ).toEqual(["cursor-agent-acp-experimental"]);
    expect(
      expandSuites(["all"], {
        includeExperimental: true,
      }),
    ).toContain("cursor-agent-acp-experimental");
  });

  it("launches desktop UI CK with an isolated debuggable profile", () => {
    const args = desktopUiCkArgs(
      {
        timeoutMs: 180_000,
        useDefaultProfile: true,
      },
      9333,
      "desktop-ui-9333",
    );

    expect(args).not.toContain("--use-default-profile");
    expect(args).toEqual([
      "ck",
      "--debug-port",
      "9333",
      "--instance-id",
      "desktop-ui-9333",
      "--seed-auth-from-default",
      "--timeout-ms",
      "5000",
    ]);
  });

  it("writes summary artifacts", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-rpc-harness-"));
    const runDir = createRunDirectory({
      cwd: tempDir,
      now: new Date("2026-01-02T03:04:05.000Z"),
    });
    const artifacts = new FileArtifactStore(runDir);
    const escaped = artifacts.writeText("../escape.txt", "nope");
    const paths = writeRunSummary(artifacts, [
      {
        id: "static",
        suite: "static",
        status: "passed",
        durationMs: 12,
        message: "ok",
      },
    ]);

    expect(paths.json).toBe(path.join(runDir, "summary.json"));
    expect(escaped.startsWith(runDir)).toBe(true);
    expect(escaped).toBe(path.join(runDir, "_", "escape.txt"));
    expect(fs.existsSync(paths.markdown)).toBe(true);
    expect(fs.readFileSync(paths.junit, "utf8")).toContain("<testsuite");
  });

  it("probes an OpenAI-compatible backend", async () => {
    const server = http.createServer((request, response) => {
      if (request.url === "/v1/models") {
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            data: [{ id: "mlx-community/Qwen3.5-4B-8bit" }],
          }),
        );
        return;
      }
      if (request.url === "/v1/chat/completions") {
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            choices: [{ message: { content: "ok" } }],
          }),
        );
        return;
      }
      response.writeHead(404);
      response.end();
    });
    await listen(server);
    try {
      const port = (server.address() as AddressInfo).port;
      const report = await probeLocalBackend({
        baseUrl: `http://127.0.0.1:${port}/v1`,
        model: "mlx-community/Qwen3.5-4B-8bit",
        apiKey: "local",
        timeoutMs: 1000,
      });

      expect(report.ok).toBe(true);
      expect(report.models).toEqual(["mlx-community/Qwen3.5-4B-8bit"]);
      expect(report.completionPreview).toBe("ok");
    } finally {
      await close(server);
    }
  });

  it("falls back to streaming completions for MLX-style servers", async () => {
    const server = http.createServer((request, response) => {
      response.setHeader("content-type", "application/json");
      if (request.url === "/v1/models") {
        response.end(
          JSON.stringify({
            data: [{ id: "mlx-community/Qwen3.5-4B-8bit" }],
          }),
        );
        return;
      }
      let body = "";
      request.on("data", (chunk: Buffer) => {
        body += chunk.toString("utf8");
      });
      request.on("end", () => {
        const parsed = JSON.parse(body) as { stream?: boolean };
        if (parsed.stream) {
          response.setHeader("content-type", "text/event-stream");
          response.end(
            [
              'data: {"choices":[{"delta":{"content":"ok"}}]}',
              "data: [DONE]",
              "",
            ].join("\n"),
          );
        } else {
          response.end(JSON.stringify({ choices: [{ message: {} }] }));
        }
      });
    });
    await listen(server);
    try {
      const port = (server.address() as AddressInfo).port;
      const report = await probeLocalBackend({
        baseUrl: `http://127.0.0.1:${port}/v1`,
        model: "mlx-community/Qwen3.5-4B-8bit",
        apiKey: "local",
        timeoutMs: 1000,
      });

      expect(report.ok).toBe(true);
      expect(report.completionPreview).toBe("ok");
    } finally {
      await close(server);
    }
  });

  it("reports missing local backend models", async () => {
    const server = http.createServer((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: [{ id: "other-model" }] }));
    });
    await listen(server);
    try {
      const port = (server.address() as AddressInfo).port;
      const report = await probeLocalBackend({
        baseUrl: `http://127.0.0.1:${port}/v1`,
        model: "mlx-community/Qwen3.5-4B-8bit",
        apiKey: "local",
        timeoutMs: 1000,
      });

      expect(report.ok).toBe(false);
      expect(report.failureCode).toBe("backend_unreachable");
      expect(report.message).toContain("was not returned");
    } finally {
      await close(server);
    }
  });

  it("reports malformed local backend completions", async () => {
    const server = http.createServer((request, response) => {
      response.setHeader("content-type", "application/json");
      if (request.url === "/v1/models") {
        response.end(
          JSON.stringify({
            data: [{ id: "mlx-community/Qwen3.5-4B-8bit" }],
          }),
        );
        return;
      }
      response.end(JSON.stringify({ choices: [{ message: {} }] }));
    });
    await listen(server);
    try {
      const port = (server.address() as AddressInfo).port;
      const report = await probeLocalBackend({
        baseUrl: `http://127.0.0.1:${port}/v1`,
        model: "mlx-community/Qwen3.5-4B-8bit",
        apiKey: "local",
        timeoutMs: 1000,
      });

      expect(report.ok).toBe(false);
      expect(report.failureCode).toBe("local_completion_failed");
      expect(report.message).toContain("malformed");
    } finally {
      await close(server);
    }
  });
});

async function listen(server: http.Server): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
}

async function close(server: http.Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
