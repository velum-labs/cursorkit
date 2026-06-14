import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DESKTOP_CERT_PATH,
  DESKTOP_KEY_PATH,
  desktopCertificateStatus,
  desktopEnv,
} from "../src/desktop.js";
import { loadConfig } from "../src/config.js";

const originalCwd = process.cwd();
let tempDir: string | undefined;

afterEach(() => {
  process.chdir(originalCwd);
  if (tempDir !== undefined) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("desktop helpers", () => {
  it("applies desktop defaults and auto-detects generated certificate paths", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-rpc-desktop-"));
    process.chdir(tempDir);
    fs.mkdirSync(path.dirname(DESKTOP_CERT_PATH), { recursive: true });
    fs.writeFileSync(DESKTOP_CERT_PATH, "cert");
    fs.writeFileSync(DESKTOP_KEY_PATH, "key");

    const env = desktopEnv({});

    expect(env.BRIDGE_DESKTOP_MODE).toBe("true");
    expect(env.BRIDGE_USE_TLS).toBe("true");
    expect(env.CURSOR_UPSTREAM_BASE_URL).toBe("https://api2.cursor.sh");
    expect(env.BRIDGE_CERT_PATH).toBe(DESKTOP_CERT_PATH);
    expect(env.BRIDGE_KEY_PATH).toBe(DESKTOP_KEY_PATH);
  });

  it("reports invalid certificates instead of throwing", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-rpc-desktop-"));
    const certPath = path.join(tempDir, "bad.crt");
    const keyPath = path.join(tempDir, "bad.key");
    fs.writeFileSync(certPath, "not a cert");
    fs.writeFileSync(keyPath, "not a key");
    const config = loadConfig({
      BRIDGE_PORT: "9443",
      BRIDGE_CERT_PATH: certPath,
      BRIDGE_KEY_PATH: keyPath,
    });

    expect(desktopCertificateStatus(config)).toContain("invalid certificate");
  });
});
