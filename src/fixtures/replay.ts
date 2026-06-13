import fs from "node:fs";

import { decodeEnvelopes, isCompressedEnvelope } from "../connectEnvelope.js";
import type { CursorProto } from "../proto.js";
import { assertFixture, type ProtocolFixture } from "./schema.js";
import { bodySha256 } from "./sanitizer.js";

export interface ReplayResult {
  fixturePath: string;
  requestFrames: number;
  responseFrames: number;
}

export function loadFixture(filePath: string): ProtocolFixture {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  assertFixture(parsed);
  return parsed;
}

export function replayFixture(
  proto: CursorProto,
  fixturePath: string,
): ReplayResult {
  const fixture = loadFixture(fixturePath);
  const requestBody = Buffer.from(fixture.request.bodyBase64, "base64");
  const responseBody = Buffer.from(fixture.response.bodyBase64, "base64");
  if (bodySha256(requestBody) !== fixture.request.bodySha256) {
    throw new Error(`${fixturePath} request body hash mismatch`);
  }
  if (bodySha256(responseBody) !== fixture.response.bodySha256) {
    throw new Error(`${fixturePath} response body hash mismatch`);
  }

  const requestFrames = decodeEnvelopes(requestBody);
  const responseFrames = decodeEnvelopes(responseBody);
  if (
    requestFrames.some(isCompressedEnvelope) ||
    responseFrames.some(isCompressedEnvelope)
  ) {
    throw new Error(
      `${fixturePath} uses compressed frames; decompression is not fixture-backed yet`,
    );
  }

  if (fixture.decoded?.requestType !== undefined) {
    proto.root
      .lookupType(fixture.decoded.requestType)
      .decode(requestFrames[0]?.payload ?? Buffer.alloc(0));
  }
  if (fixture.decoded?.responseType !== undefined) {
    proto.root
      .lookupType(fixture.decoded.responseType)
      .decode(responseFrames[0]?.payload ?? Buffer.alloc(0));
  }

  return {
    fixturePath,
    requestFrames: requestFrames.length,
    responseFrames: responseFrames.length,
  };
}
