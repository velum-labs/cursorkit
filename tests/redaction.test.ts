import { afterEach, describe, expect, it, vi } from "vitest";

import { createLogger } from "../src/logger.js";
import {
  redactForLogging,
  redactHeaders,
  redactValue,
} from "../src/redaction.js";

describe("log redaction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts headers, bearer tokens, and token query params", () => {
    expect(
      redactHeaders({
        authorization: "Bearer secret-token",
        cookie: "session=secret",
        "x-api-key": "api-secret",
        referer: "https://example.com/callback?token=secret&ok=1",
      }),
    ).toEqual({
      authorization: "[REDACTED]",
      cookie: "[REDACTED]",
      "x-api-key": "[REDACTED]",
      referer: "https://example.com/callback?token=[REDACTED]&ok=1",
    });
    expect(redactValue("Authorization: Bearer abc123")).toBe(
      "Authorization: Bearer [REDACTED]",
    );
  });

  it("redacts nested sensitive metadata keys before writing logs", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createLogger("debug");

    logger.info("test", {
      requestHeaders: {
        cookie: "session=secret",
        authorization: "Bearer secret",
      },
      apiKey: "secret",
      nested: { accessToken: "token-secret" },
    });

    const output = String(spy.mock.calls[0]?.[0]);
    expect(output).toContain('"cookie":"[REDACTED]"');
    expect(output).toContain('"authorization":"[REDACTED]"');
    expect(output).toContain('"apiKey":"[REDACTED]"');
    expect(output).toContain('"accessToken":"[REDACTED]"');
    expect(output).not.toContain("secret");
  });

  it("keeps non-sensitive metadata structure while redacting sensitive keys", () => {
    expect(
      redactForLogging({
        promptChars: 123,
        toolArgsSummary: { path: { type: "string", chars: 12 } },
        token: "secret",
      }),
    ).toEqual({
      promptChars: 123,
      toolArgsSummary: { path: { type: "string", chars: 12 } },
      token: "[REDACTED]",
    });
  });
});
