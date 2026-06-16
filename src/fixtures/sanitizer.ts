import { createHash } from "node:crypto";

import type {
  FixtureHttpMessage,
  ModelFusionPayloadSanitization,
  ProtocolFixture,
} from "./schema.js";
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

export function sha256Prefixed(body: string | Uint8Array): string {
  return `sha256:${bodySha256(typeof body === "string" ? Buffer.from(body) : body)}`;
}

export function sanitizeModelFusionPayload(input: {
  rawPayload: string;
  synthetic?: boolean;
}): ModelFusionPayloadSanitization {
  const redacted = input.synthetic
    ? input.rawPayload
    : redactValue(input.rawPayload);
  return {
    redactionStatus: input.synthetic ? "synthetic" : "redacted",
    raw_hash: sha256Prefixed(input.rawPayload),
    redacted_hash: sha256Prefixed(redacted),
    persistedPayload: redacted,
  };
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
