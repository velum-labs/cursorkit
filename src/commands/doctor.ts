import type { Command } from "commander";

import { loadConfig } from "../config.js";
import { loadTlsMaterial } from "../certs.js";
import {
  desktopCertificateStatus,
  desktopDnsStatus,
  desktopEnv,
  localModelBackendStatus,
  upstreamReachabilityStatus,
} from "../desktop.js";
import {
  listProtoFiles,
  loadCursorProto,
  resolveProtoDirectory,
} from "../proto.js";
import {
  bold,
  brandHeader,
  green,
  uiStream,
  withSpinner,
} from "../ui/index.js";
import { renderCheck, warningLine, type Check } from "./render.js";

type Config = ReturnType<typeof loadConfig>;

function write(line: string): void {
  uiStream().write(`${line}\n`);
}

async function runDoctor(config: Config): Promise<void> {
  write(`\n${brandHeader("environment check")}\n`);

  const proto = await withSpinner("loading Cursor proto", () =>
    loadCursorProto(),
  );
  const protoDir = resolveProtoDirectory();

  const checks: Check[] = [
    { label: "proto directory", detail: protoDir },
    { label: "proto files", detail: String(listProtoFiles(protoDir).length) },
    {
      label: "available models type",
      detail: proto.AvailableModelsResponse.fullName,
    },
    {
      label: "chat type",
      detail: proto.StreamUnifiedChatRequestWithTools.fullName,
    },
    { label: "bind", detail: `${config.host}:${config.port}` },
    { label: "tls", detail: config.useTls ? "enabled" : "disabled" },
    {
      label: "upstream",
      ok: config.upstreamBaseUrl !== undefined,
      detail: config.upstreamBaseUrl ?? "not configured",
      hint: "pass-through traffic needs CURSOR_UPSTREAM_BASE_URL",
    },
    {
      label: "local models",
      detail: config.models.map((model) => model.id).join(", "),
    },
    {
      label: "capture",
      detail: config.captureEnabled
        ? `enabled -> ${config.captureDir}`
        : "disabled",
    },
    { label: "fail-open", detail: String(config.failOpen) },
    {
      label: "auth",
      detail: config.authToken === undefined ? "disabled" : "enabled",
    },
    {
      label: "non-localhost unsafe mode",
      detail: String(config.unsafeAllowNonLocalhost),
    },
  ];

  if (config.useTls) {
    const tls = await loadTlsMaterial(config);
    checks.push({
      label: "tls material",
      detail: tls.generated
        ? "generated self-signed dev certificate"
        : "custom certificate",
    });
  }

  write(bold("configuration"));
  for (const check of checks) write(`  ${renderCheck(check)}`);

  const warnings: string[] = [];
  if (config.captureEnabled) {
    warnings.push(
      "capture mode treats traffic as sensitive; sanitize before committing fixtures",
    );
  }
  if (config.modelPayloadLogging === "full") {
    warnings.push(
      "BRIDGE_LOG_MODEL_PAYLOADS=full may log prompt and tool payloads; use only for local debugging",
    );
  }
  if (config.unsafeAllowNonLocalhost) {
    warnings.push(
      "non-localhost unsafe mode exposes the bridge without built-in auth",
    );
  }
  if (warnings.length > 0) {
    write("");
    for (const warning of warnings) write(`  ${warningLine(warning)}`);
  }
}

async function runDesktopDoctor(config: Config): Promise<void> {
  write(`\n${bold("desktop proxy")}\n`);
  const checks: Check[] = [
    { label: "desktop mode", detail: String(config.desktopMode) },
    { label: "public origin", detail: config.publicOrigin ?? "not configured" },
    { label: "tls hostnames", detail: config.tlsHostnames.join(", ") },
    { label: "route inventory", detail: String(config.routeInventoryEnabled) },
    {
      label: "desktop upstream",
      detail: config.upstreamBaseUrl ?? "not configured",
    },
    {
      label: "desktop upstream connect",
      detail:
        config.upstreamConnectHost === undefined
          ? "system DNS"
          : `${config.upstreamConnectHost}${config.upstreamConnectPort === undefined ? "" : `:${config.upstreamConnectPort}`}`,
    },
    { label: "desktop cert", detail: desktopCertificateStatus(config) },
    { label: "desktop dns", detail: await desktopDnsStatus(config) },
    {
      label: "upstream reachability",
      detail: await upstreamReachabilityStatus(config),
    },
    {
      label: "local model backend",
      detail: await localModelBackendStatus(config),
    },
  ];
  for (const check of checks) write(`  ${renderCheck(check)}`);
  write("");
  write(green("desktop checks complete."));
}

export function registerDoctor(program: Command): void {
  program
    .command("doctor")
    .description("check local configuration and proto availability")
    .action(async () => {
      await runDoctor(loadConfig(process.env));
    });

  program
    .command("desktop-doctor")
    .description("check Cursor desktop proxy prerequisites")
    .action(async () => {
      const config = loadConfig(desktopEnv(process.env));
      await runDoctor(config);
      await runDesktopDoctor(config);
    });
}
