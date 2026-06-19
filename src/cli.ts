#!/usr/bin/env node
import fs from "node:fs";
import type { Server } from "node:http";
import path from "node:path";

import { loadConfig } from "./config.js";
import { loadTlsMaterial } from "./certs.js";
import {
  desktopCertificateStatus,
  desktopDnsStatus,
  desktopEnv,
  desktopTrustCommand,
  localModelBackendStatus,
  upstreamReachabilityStatus,
  writeDesktopCertificate,
} from "./desktop.js";
import { createLogger } from "./logger.js";
import {
  assertCursorRunRequestV1,
  assertCursorRunResultV1,
  assertHarnessRunRequestV1,
  assertHarnessRunResultV1,
} from "./fixtures/modelFusion.js";
import {
  listProtoFiles,
  loadCursorProto,
  resolveProtoDirectory,
} from "./proto.js";
import { createBridgeRuntime, startServer } from "./server.js";

type Command =
  | "serve"
  | "doctor"
  | "capture"
  | "fixtures"
  | "desktop-cert"
  | "desktop-proxy"
  | "desktop-doctor"
  | "help";

const HELP = `cursorkit

Usage:
  cursorkit serve            Start the local bridge
  cursorkit doctor           Check local configuration and proto availability
  cursorkit desktop-cert     Generate local TLS material for Cursor desktop proxying
  cursorkit desktop-proxy    Start the bridge with Cursor desktop proxy defaults
  cursorkit desktop-doctor   Check Cursor desktop proxy prerequisites
  cursorkit capture          Print capture-mode guidance
  cursorkit fixtures         Validate committed fixture metadata
  cursorkit --help           Show this help

Environment:
  BRIDGE_HOST=127.0.0.1
  BRIDGE_PORT=9443
  CURSOR_UPSTREAM_BASE_URL=https://example.cursor-backend.local
  MODEL_BASE_URL=http://localhost:8080/v1
  MODEL_NAME=local-model
`;

async function main(argv: string[]): Promise<void> {
  const command = parseCommand(argv);
  if (command === "help") {
    console.log(HELP);
    return;
  }

  const config = loadConfig(
    command === "desktop-proxy" || command === "desktop-doctor"
      ? desktopEnv(process.env)
      : process.env,
  );
  const logger = createLogger(config.logLevel);

  switch (command) {
    case "serve": {
      const runtime = await createBridgeRuntime(config, logger);
      installGracefulShutdown(await startServer(runtime), logger);
      break;
    }
    case "doctor": {
      await doctor(config);
      break;
    }
    case "capture": {
      capture(config);
      break;
    }
    case "fixtures": {
      validateFixtures(config.captureDir);
      break;
    }
    case "desktop-cert": {
      await desktopCert();
      break;
    }
    case "desktop-proxy": {
      const runtime = await createBridgeRuntime(config, logger);
      installGracefulShutdown(await startServer(runtime), logger);
      break;
    }
    case "desktop-doctor": {
      await doctor(config);
      await desktopDoctor(config);
      break;
    }
    default: {
      const exhaustive: never = command;
      throw new Error(`Unhandled command: ${exhaustive}`);
    }
  }
}

function parseCommand(argv: string[]): Command {
  const first = argv[2];
  if (
    first === undefined ||
    first === "--help" ||
    first === "-h" ||
    first === "help"
  ) {
    return "help";
  }
  if (
    first === "serve" ||
    first === "doctor" ||
    first === "capture" ||
    first === "fixtures" ||
    first === "desktop-cert" ||
    first === "desktop-proxy" ||
    first === "desktop-doctor"
  ) {
    return first;
  }
  throw new Error(`Unknown command: ${first}\n\n${HELP}`);
}

async function doctor(config: ReturnType<typeof loadConfig>): Promise<void> {
  const checks: Array<[string, string]> = [];
  const protoDir = resolveProtoDirectory();
  checks.push(["proto directory", protoDir]);
  checks.push(["proto files", String(listProtoFiles(protoDir).length)]);
  const proto = await loadCursorProto();
  checks.push([
    "available models type",
    proto.AvailableModelsResponse.fullName,
  ]);
  checks.push(["chat type", proto.StreamUnifiedChatRequestWithTools.fullName]);
  checks.push(["bind", `${config.host}:${config.port}`]);
  checks.push(["tls", config.useTls ? "enabled" : "disabled"]);
  checks.push(["upstream", config.upstreamBaseUrl ?? "not configured"]);
  checks.push([
    "local models",
    config.models.map((model) => model.id).join(", "),
  ]);
  checks.push([
    "capture",
    config.captureEnabled ? `enabled -> ${config.captureDir}` : "disabled",
  ]);
  checks.push(["fail-open", String(config.failOpen)]);
  checks.push([
    "auth",
    config.authToken === undefined ? "disabled" : "enabled",
  ]);
  checks.push([
    "non-localhost unsafe mode",
    String(config.unsafeAllowNonLocalhost),
  ]);

  if (config.useTls) {
    const tls = await loadTlsMaterial(config);
    checks.push([
      "tls material",
      tls.generated
        ? "generated self-signed dev certificate"
        : "custom certificate",
    ]);
  }

  for (const [name, value] of checks) {
    console.log(`${name}: ${value}`);
  }

  if (config.upstreamBaseUrl === undefined) {
    console.warn(
      "warning: pass-through traffic needs CURSOR_UPSTREAM_BASE_URL",
    );
  }
  if (config.captureEnabled) {
    console.warn(
      "warning: capture mode treats traffic as sensitive; sanitize before committing fixtures",
    );
  }
  if (config.modelPayloadLogging === "full") {
    console.warn(
      "warning: BRIDGE_LOG_MODEL_PAYLOADS=full may log prompt and tool payloads; use only for local debugging",
    );
  }
  if (config.unsafeAllowNonLocalhost) {
    console.warn(
      "warning: non-localhost unsafe mode exposes the bridge without built-in auth",
    );
  }
}

function installGracefulShutdown(
  server: Server,
  logger: ReturnType<typeof createLogger>,
): void {
  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      logger.warn("forcing bridge shutdown", { signal });
      process.exit(1);
    }
    shuttingDown = true;
    logger.info("shutting down bridge", { signal });
    const forceTimer = setTimeout(() => {
      logger.error("bridge shutdown timed out", { signal });
      process.exit(1);
    }, 5_000);
    server.close((error) => {
      clearTimeout(forceTimer);
      if (error !== undefined) {
        logger.error("bridge shutdown failed", { error: error.message });
        process.exitCode = 1;
      }
      process.exit();
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

async function desktopCert(): Promise<void> {
  const cert = await writeDesktopCertificate();

  console.log(`cert: ${cert.certPath}`);
  console.log(`key: ${cert.keyPath}`);
  console.log("");
  console.log("Manual macOS trust command:");
  console.log(desktopTrustCommand(cert.certPath).join(" "));
  console.log("");
  console.log("Then start with:");
  console.log(
    `BRIDGE_CERT_PATH=${cert.certPath} BRIDGE_KEY_PATH=${cert.keyPath} cursorkit desktop-proxy`,
  );
}

async function desktopDoctor(
  config: ReturnType<typeof loadConfig>,
): Promise<void> {
  const checks: Array<[string, string]> = [];
  checks.push(["desktop mode", String(config.desktopMode)]);
  checks.push(["public origin", config.publicOrigin ?? "not configured"]);
  checks.push(["tls hostnames", config.tlsHostnames.join(", ")]);
  checks.push(["route inventory", String(config.routeInventoryEnabled)]);
  checks.push(["desktop upstream", config.upstreamBaseUrl ?? "not configured"]);
  checks.push([
    "desktop upstream connect",
    config.upstreamConnectHost === undefined
      ? "system DNS"
      : `${config.upstreamConnectHost}${config.upstreamConnectPort === undefined ? "" : `:${config.upstreamConnectPort}`}`,
  ]);
  checks.push(["desktop cert", desktopCertificateStatus(config)]);
  checks.push(["desktop dns", await desktopDnsStatus(config)]);
  checks.push([
    "upstream reachability",
    await upstreamReachabilityStatus(config),
  ]);
  checks.push(["local model backend", await localModelBackendStatus(config)]);

  for (const [name, value] of checks) {
    console.log(`${name}: ${value}`);
  }
}

function capture(config: ReturnType<typeof loadConfig>): void {
  console.log(`captureEnabled: ${config.captureEnabled}`);
  console.log(`captureDir: ${config.captureDir}`);
  console.log(
    "Capture mode is explicit and sanitized fixture writing is required before committing data.",
  );
}

function validateFixtures(captureDir: string): void {
  const modelFusionCount = validateModelFusionFixtures();
  if (!fs.existsSync(captureDir)) {
    console.log(`No fixture capture directory found at ${captureDir}`);
    console.log(`Validated ${modelFusionCount} model-fusion fixture file(s)`);
    return;
  }

  const files = fs
    .readdirSync(captureDir)
    .filter((file) => file.endsWith(".json"));
  for (const file of files) {
    const fullPath = path.join(captureDir, file);
    const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8")) as {
      redaction?: { status?: string };
    };
    if (parsed.redaction?.status !== "sanitized") {
      throw new Error(`${fullPath} is missing redaction.status=sanitized`);
    }
  }
  console.log(
    `Validated ${files.length} capture fixture file(s) and ${modelFusionCount} model-fusion fixture file(s)`,
  );
}

function validateModelFusionFixtures(): number {
  const root = path.resolve("fixtures", "model-fusion-contract");
  if (!fs.existsSync(root)) return 0;
  let count = 0;
  const validators: Record<string, (value: unknown) => void> = {
    "harness-run-request.v1": assertHarnessRunRequestV1,
    "harness-run-result.v1": assertHarnessRunResultV1,
    "cursor-run-request.v1": assertCursorRunRequestV1,
    "cursor-run-result.v1": assertCursorRunResultV1,
  };
  for (const [schema, validate] of Object.entries(validators)) {
    const schemaDir = path.join(root, schema);
    if (!fs.existsSync(schemaDir)) continue;
    for (const file of fs
      .readdirSync(schemaDir)
      .filter((item) => item.endsWith(".json"))) {
      const fixturePath = path.join(schemaDir, file);
      validate(JSON.parse(fs.readFileSync(fixturePath, "utf8")) as unknown);
      count++;
    }
  }
  return count;
}

main(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
