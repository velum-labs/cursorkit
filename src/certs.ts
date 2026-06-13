import fs from "node:fs";

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

  const attrs = [{ name: "commonName", value: "localhost" }];
  const pem = await generate(attrs, {
    notAfterDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    keySize: 2048,
    algorithm: "sha256",
    extensions: [
      {
        name: "subjectAltName",
        altNames: [
          { type: 2, value: "localhost" },
          { type: 7, ip: "127.0.0.1" },
          { type: 7, ip: "::1" },
        ],
      },
    ],
  });
  return { cert: pem.cert, key: pem.private, generated: true };
}
