import { X509Certificate } from "node:crypto";

import { describe, expect, it } from "vitest";

import { generateTlsMaterial } from "../src/certs.js";

describe("generateTlsMaterial", () => {
  it("includes desktop proxy hostnames in the certificate SANs", async () => {
    const material = await generateTlsMaterial([
      "api2.cursor.sh",
      "localhost",
      "127.0.0.1",
    ]);
    const cert = new X509Certificate(material.cert);

    expect(cert.subject).toContain("CN=api2.cursor.sh");
    expect(cert.subjectAltName).toContain("DNS:api2.cursor.sh");
    expect(cert.subjectAltName).toContain("DNS:localhost");
    expect(cert.subjectAltName).toContain("IP Address:127.0.0.1");
  });
});
