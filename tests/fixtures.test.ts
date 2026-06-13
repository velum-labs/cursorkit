import { describe, expect, it } from "vitest";

import { assertFixture, type ProtocolFixture } from "../src/fixtures/schema.js";
import { bodySha256, sanitizeFixture } from "../src/fixtures/sanitizer.js";

describe("fixtures", () => {
  it("requires sanitized fixture metadata", () => {
    expect(() =>
      assertFixture({ schemaVersion: 1, redaction: { status: "raw" } }),
    ).toThrow(/sanitized/);
  });

  it("sanitizes headers and recomputes body hashes", () => {
    const body = Buffer.from("hello");
    const fixture: ProtocolFixture = {
      schemaVersion: 1,
      cursorVersion: "test",
      protoVersion: "test",
      capturedAt: new Date(0).toISOString(),
      sanitizerVersion: "0",
      redaction: { status: "sanitized" },
      request: {
        httpVersion: "1.1",
        method: "POST",
        path: "/x?token=secret",
        headers: { authorization: "Bearer secret" },
        trailers: {},
        bodySha256: "",
        bodyBase64: body.toString("base64"),
      },
      response: {
        httpVersion: "1.1",
        status: 200,
        path: "/x",
        headers: {},
        trailers: {},
        bodySha256: "",
        bodyBase64: body.toString("base64"),
      },
    };

    const sanitized = sanitizeFixture(fixture);

    expect(sanitized.request.headers.authorization).toBe("[REDACTED]");
    expect(sanitized.request.path).toContain("token=[REDACTED]");
    expect(sanitized.request.bodySha256).toBe(bodySha256(body));
  });
});
