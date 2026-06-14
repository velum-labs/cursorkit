import fs from "node:fs";
import { isIP } from "node:net";

import { generate } from "selfsigned";

import type { BridgeConfig } from "./config.js";

export interface TlsMaterial {
  cert: string;
  key: string;
  generated: boolean;
}

export async function loadTlsMaterial(
  config: BridgeConfig,
): Promise<TlsMaterial> {
  if (config.certPath !== undefined || config.keyPath !== undefined) {
    if (config.certPath === undefined || config.keyPath === undefined) {
      throw new Error(
        "Both BRIDGE_CERT_PATH and BRIDGE_KEY_PATH must be set when using custom TLS material",
      );
    }
    return {
      cert: fs.readFileSync(config.certPath, "utf8"),
      key: fs.readFileSync(config.keyPath, "utf8"),
      generated: false,
    };
  }

  return generateTlsMaterial(config.tlsHostnames);
}

export async function generateTlsMaterial(
  hostnames: string[],
): Promise<TlsMaterial> {
  const primaryHostname = hostnames[0] ?? "localhost";
  const attrs = [{ name: "commonName", value: primaryHostname }];
  const pem = await generate(attrs, {
    notAfterDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    keySize: 2048,
    algorithm: "sha256",
    extensions: [
      {
        name: "subjectAltName",
        altNames: hostnames.map((hostname) =>
          isIP(hostname) === 0
            ? { type: 2, value: hostname }
            : { type: 7, ip: hostname },
        ),
      },
    ],
  });
  return { cert: pem.cert, key: pem.private, generated: true };
}
