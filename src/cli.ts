#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { loadConfig } from "./config.js";
import { loadTlsMaterial } from "./certs.js";
import { createLogger } from "./logger.js";
import {
  listProtoFiles,
  loadCursorProto,
  resolveProtoDirectory,
} from "./proto.js";
import { createBridgeRuntime, startServer } from "./server.js";

type Command = "serve" | "doctor" | "capture" | "fixtures" | "help";

const HELP = `cursor-rpc

Usage:
  cursor-rpc serve       Start the local bridge
  cursor-rpc doctor      Check local configuration and proto availability
  cursor-rpc capture     Print capture-mode guidance
  cursor-rpc fixtures    Validate committed fixture metadata
  cursor-rpc --help      Show this help

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

  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  switch (command) {
    case "serve": {
      const runtime = await createBridgeRuntime(config, logger);
      await startServer(runtime);
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
    first === "fixtures"
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
}

function capture(config: ReturnType<typeof loadConfig>): void {
  console.log(`captureEnabled: ${config.captureEnabled}`);
  console.log(`captureDir: ${config.captureDir}`);
  console.log(
    "Capture mode is explicit and sanitized fixture writing is required before committing data.",
  );
}

function validateFixtures(captureDir: string): void {
  if (!fs.existsSync(captureDir)) {
    console.log(`No fixture capture directory found at ${captureDir}`);
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
  console.log(`Validated ${files.length} fixture file(s)`);
}

main(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
