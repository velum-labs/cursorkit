import { createHash } from "node:crypto";

import type { FixtureHttpMessage, ProtocolFixture } from "./schema.js";
import { redactHeaders, redactValue } from "../redaction.js";

export const SANITIZER_VERSION = "1";

export function sanitizeFixture(fixture: ProtocolFixture): ProtocolFixture {
  return {
    ...fixture,
    sanitizerVersion: SANITIZER_VERSION,
    redaction: {
      status: "sanitized",
      notes: "headers and URLs redacted by cursor-rpc sanitizer",
    },
    request: sanitizeMessage(fixture.request),
    response: sanitizeMessage(fixture.response),
  };
}

export function bodySha256(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

function sanitizeMessage(message: FixtureHttpMessage): FixtureHttpMessage {
  const body = Buffer.from(message.bodyBase64, "base64");
  return {
    ...message,
    path: redactValue(message.path),
    query: message.query === undefined ? undefined : redactValue(message.query),
    headers: redactHeaders(message.headers),
    trailers: redactHeaders(message.trailers),
    bodySha256: bodySha256(body),
  };
}
