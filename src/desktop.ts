import { X509Certificate } from "node:crypto";
import { lookup } from "node:dns/promises";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";

import { generateTlsMaterial } from "./certs.js";
import type { loadConfig } from "./config.js";

export const DESKTOP_HOSTNAME = "api2.cursor.sh";
export const DESKTOP_HOSTNAMES = [
  DESKTOP_HOSTNAME,
  "api3.cursor.sh",
  "agent.api5.cursor.sh",
  "agentn.api5.cursor.sh",
  "agentn.global.api5.cursor.sh",
] as const;
export const DESKTOP_CERT_DIR = path.join(".cursor-rpc", "certs");
export const DESKTOP_CERT_PATH = path.join(
  DESKTOP_CERT_DIR,
  `${DESKTOP_HOSTNAME}.crt`,
);
export const DESKTOP_KEY_PATH = path.join(
  DESKTOP_CERT_DIR,
  `${DESKTOP_HOSTNAME}.key`,
);

type Config = ReturnType<typeof loadConfig>;

export function desktopEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = { ...env };
  next.BRIDGE_DESKTOP_MODE ??= "true";
  next.BRIDGE_USE_TLS ??= "true";
  next.BRIDGE_TLS_HOSTNAMES ??= `${DESKTOP_HOSTNAMES.join(",")},localhost,127.0.0.1,::1`;
  next.BRIDGE_PUBLIC_ORIGIN ??= `https://${DESKTOP_HOSTNAME}`;
  next.CURSOR_UPSTREAM_BASE_URL ??= `https://${DESKTOP_HOSTNAME}`;
  if (
    next.BRIDGE_CERT_PATH === undefined &&
    next.BRIDGE_KEY_PATH === undefined &&
    fs.existsSync(DESKTOP_CERT_PATH) &&
    fs.existsSync(DESKTOP_KEY_PATH)
  ) {
    next.BRIDGE_CERT_PATH = DESKTOP_CERT_PATH;
    next.BRIDGE_KEY_PATH = DESKTOP_KEY_PATH;
  }
  return next;
}

export function desktopTrustCommand(certPath = DESKTOP_CERT_PATH): string[] {
  return [
    "sudo",
    "security",
    "add-trusted-cert",
    "-d",
    "-r",
    "trustRoot",
    "-k",
    "/Library/Keychains/System.keychain",
    certPath,
  ];
}

export async function writeDesktopCertificate(): Promise<{
  certPath: string;
  keyPath: string;
  created: boolean;
}> {
  if (
    fs.existsSync(DESKTOP_CERT_PATH) &&
    fs.existsSync(DESKTOP_KEY_PATH) &&
    desktopCertificateCoversHostnames(DESKTOP_CERT_PATH, [...DESKTOP_HOSTNAMES])
  ) {
    return {
      certPath: DESKTOP_CERT_PATH,
      keyPath: DESKTOP_KEY_PATH,
      created: false,
    };
  }

  fs.mkdirSync(DESKTOP_CERT_DIR, { recursive: true });
  const tls = await generateTlsMaterial([
    ...DESKTOP_HOSTNAMES,
    "localhost",
    "127.0.0.1",
    "::1",
  ]);
  fs.writeFileSync(DESKTOP_CERT_PATH, tls.cert, { mode: 0o644 });
  fs.writeFileSync(DESKTOP_KEY_PATH, tls.key, { mode: 0o600 });
  return {
    certPath: DESKTOP_CERT_PATH,
    keyPath: DESKTOP_KEY_PATH,
    created: true,
  };
}

export function desktopCertificateStatus(config: Config): string {
  if (config.certPath === undefined || config.keyPath === undefined) {
    return "not configured; run cursorkit desktop-cert and set BRIDGE_CERT_PATH/BRIDGE_KEY_PATH";
  }
  if (!fs.existsSync(config.certPath) || !fs.existsSync(config.keyPath)) {
    return "missing cert or key path";
  }
  try {
    const cert = new X509Certificate(fs.readFileSync(config.certPath));
    const altNames = cert.subjectAltName ?? "";
    const missing = DESKTOP_HOSTNAMES.filter(
      (hostname) => !altNames.includes(`DNS:${hostname}`),
    );
    return missing.length === 0
      ? `covers ${DESKTOP_HOSTNAMES.join(", ")}`
      : `missing ${missing.join(", ")}`;
  } catch (error) {
    return `invalid certificate: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function desktopCertificateCoversHostnames(
  certPath: string,
  hostnames: string[],
): boolean {
  try {
    const cert = new X509Certificate(fs.readFileSync(certPath));
    const altNames = cert.subjectAltName ?? "";
    return hostnames.every((hostname) => altNames.includes(`DNS:${hostname}`));
  } catch {
    return false;
  }
}

export async function desktopDnsStatus(config: Config): Promise<string> {
  try {
    const result = await lookup(DESKTOP_HOSTNAME);
    const localRedirect =
      result.address === "127.0.0.1" || result.address === "::1";
    if (localRedirect && config.upstreamConnectHost === undefined) {
      return `${DESKTOP_HOSTNAME} -> ${result.address}; set CURSOR_UPSTREAM_CONNECT_HOST to avoid proxy loops`;
    }
    return `${DESKTOP_HOSTNAME} -> ${result.address}`;
  } catch (error) {
    return `lookup failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function upstreamReachabilityStatus(
  config: Config,
): Promise<string> {
  if (config.upstreamBaseUrl === undefined) {
    return "not configured";
  }
  const upstreamUrl = new URL(config.upstreamBaseUrl);
  const client = upstreamUrl.protocol === "https:" ? https : http;
  const host = config.upstreamConnectHost ?? upstreamUrl.hostname;
  const port =
    config.upstreamConnectPort ??
    (upstreamUrl.port.length > 0
      ? Number(upstreamUrl.port)
      : upstreamUrl.protocol === "https:"
        ? 443
        : 80);

  return new Promise((resolve) => {
    const request = client.request(
      {
        method: "HEAD",
        hostname: host,
        port,
        path: "/",
        headers: { host: upstreamUrl.host },
        servername:
          upstreamUrl.protocol === "https:" ? upstreamUrl.hostname : undefined,
        timeout: 5_000,
      },
      (response) => {
        response.resume();
        resolve(`HTTP ${response.statusCode ?? 0}`);
      },
    );
    request.on("timeout", () => {
      request.destroy(new Error("timeout"));
    });
    request.on("error", (error) => {
      resolve(error.message);
    });
    request.end();
  });
}

export async function localModelBackendStatus(config: Config): Promise<string> {
  const firstModel = config.models[0];
  if (firstModel === undefined) {
    return "no local models configured";
  }
  const modelsUrl = new URL(`${firstModel.baseUrl.replace(/\/$/, "")}/models`);
  try {
    const response = await fetch(modelsUrl, {
      headers: firstModel.apiKey
        ? { authorization: `Bearer ${firstModel.apiKey}` }
        : {},
    });
    return `${modelsUrl.toString()} -> HTTP ${response.status}`;
  } catch (error) {
    return `${modelsUrl.toString()} -> ${error instanceof Error ? error.message : String(error)}`;
  }
}
