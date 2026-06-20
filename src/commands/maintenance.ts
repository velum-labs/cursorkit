import fs from "node:fs";
import path from "node:path";

import type { Command } from "commander";

import { loadConfig } from "../config.js";
import { desktopTrustCommand, writeDesktopCertificate } from "../desktop.js";
import {
  assertCursorRunRequestV1,
  assertCursorRunResultV1,
  assertHarnessRunRequestV1,
  assertHarnessRunResultV1,
} from "../fixtures/modelFusion.js";
import {
  bold,
  brandHeader,
  dim,
  done,
  note,
  uiStream,
  withSpinner,
} from "../ui/index.js";

function write(line: string): void {
  uiStream().write(`${line}\n`);
}

function capture(captureDir: string, captureEnabled: boolean): void {
  write(`\n${brandHeader("capture")}\n`);
  write(`${dim("captureEnabled:")} ${captureEnabled}`);
  write(`${dim("captureDir:")} ${captureDir}`);
  note(
    "Capture mode is explicit; sanitized fixture writing is required before committing data.",
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

function validateFixtures(captureDir: string): void {
  write(`\n${brandHeader("fixtures")}\n`);
  const modelFusionCount = validateModelFusionFixtures();
  if (!fs.existsSync(captureDir)) {
    note(`No fixture capture directory found at ${captureDir}`);
    done(`Validated ${modelFusionCount} model-fusion fixture file(s)`);
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
  done(
    `Validated ${files.length} capture fixture file(s) and ${modelFusionCount} model-fusion fixture file(s)`,
  );
}

async function desktopCert(): Promise<void> {
  write(`\n${brandHeader("desktop certificate")}\n`);
  const cert = await withSpinner("generating self-signed certificate", () =>
    writeDesktopCertificate(),
  );

  write(`${dim("cert:")} ${cert.certPath}`);
  write(`${dim("key:")}  ${cert.keyPath}`);
  write("");
  write(bold("Manual macOS trust command:"));
  write(desktopTrustCommand(cert.certPath).join(" "));
  write("");
  write(bold("Then start with:"));
  write(
    `BRIDGE_CERT_PATH=${cert.certPath} BRIDGE_KEY_PATH=${cert.keyPath} cursorkit desktop-proxy`,
  );
}

export function registerMaintenance(program: Command): void {
  program
    .command("capture")
    .description("print capture-mode guidance")
    .action(() => {
      const config = loadConfig(process.env);
      capture(config.captureDir, config.captureEnabled);
    });

  program
    .command("fixtures")
    .description("validate committed fixture metadata")
    .action(() => {
      const config = loadConfig(process.env);
      validateFixtures(config.captureDir);
    });

  program
    .command("desktop-cert")
    .description("generate local TLS material for Cursor desktop proxying")
    .action(async () => {
      await desktopCert();
    });
}
