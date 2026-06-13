import { describe, expect, it } from "vitest";

import { redactHeaders, redactValue } from "../src/redaction.js";

describe("redaction", () => {
  it("redacts auth headers", () => {
    expect(
      redactHeaders({
        authorization: "Bearer secret",
        cookie: "a=b",
        "x-safe": "ok",
      }),
    ).toEqual({
      authorization: "[REDACTED]",
      cookie: "[REDACTED]",
      "x-safe": "ok",
    });
  });

  it("redacts token query values", () => {
    expect(redactValue("/path?token=abc&ok=1")).toBe(
      "/path?token=[REDACTED]&ok=1",
    );
  });
});
