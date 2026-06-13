import { describe, expect, it } from "vitest";

import {
  decodeEnvelopes,
  encodeEndStream,
  encodeEnvelope,
  firstMessagePayload,
  isCompressedEnvelope,
  isEndStreamEnvelope,
  parseEnvelopes,
} from "../src/connectEnvelope.js";

describe("Connect envelope helpers", () => {
  it("round-trips envelopes and detects end-stream metadata", () => {
    const body = Buffer.concat([
      encodeEnvelope(Buffer.from("hello")),
      encodeEndStream({ done: "true" }),
    ]);
    const envelopes = decodeEnvelopes(body);

    expect(envelopes).toHaveLength(2);
    expect(envelopes[0]?.payload.toString()).toBe("hello");
    expect(isEndStreamEnvelope(envelopes[1]!)).toBe(true);
  });

  it("returns incremental parse remainder instead of throwing", () => {
    const body = encodeEnvelope(Buffer.from("hello"));
    const result = parseEnvelopes(body.subarray(0, body.length - 2));

    expect(result.envelopes).toHaveLength(0);
    expect(result.remainder.length).toBeGreaterThan(0);
  });

  it("detects compressed frames", () => {
    const envelope = decodeEnvelopes(
      encodeEnvelope(Buffer.from("hello"), 0x01),
    )[0]!;

    expect(isCompressedEnvelope(envelope)).toBe(true);
  });

  it("extracts the first message payload", () => {
    expect(
      firstMessagePayload(encodeEnvelope(Buffer.from("hello"))).toString(),
    ).toBe("hello");
  });
});
