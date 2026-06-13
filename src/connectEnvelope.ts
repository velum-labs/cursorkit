const HEADER_LENGTH = 5;
const END_STREAM_FLAG = 0x02;

export interface ConnectEnvelope {
  flags: number;
  payload: Buffer;
}

export function encodeEnvelope(payload: Uint8Array, flags = 0): Buffer {
  const body = Buffer.from(payload);
  const frame = Buffer.allocUnsafe(HEADER_LENGTH + body.length);
  frame.writeUInt8(flags, 0);
  frame.writeUInt32BE(body.length, 1);
  body.copy(frame, HEADER_LENGTH);
  return frame;
}

export function encodeEndStream(metadata: Record<string, string> = {}): Buffer {
  return encodeEnvelope(Buffer.from(JSON.stringify({ metadata }), "utf8"), END_STREAM_FLAG);
}

export function decodeEnvelopes(input: Buffer): ConnectEnvelope[] {
  const envelopes: ConnectEnvelope[] = [];
  let offset = 0;

  while (offset < input.length) {
    if (input.length - offset < HEADER_LENGTH) {
      throw new Error("Truncated Connect envelope header");
    }

    const flags = input.readUInt8(offset);
    const length = input.readUInt32BE(offset + 1);
    const payloadStart = offset + HEADER_LENGTH;
    const payloadEnd = payloadStart + length;
    if (payloadEnd > input.length) {
      throw new Error("Truncated Connect envelope payload");
    }

    envelopes.push({ flags, payload: input.subarray(payloadStart, payloadEnd) });
    offset = payloadEnd;
  }

  return envelopes;
}

export function firstMessagePayload(input: Buffer): Buffer {
  if (input.length < HEADER_LENGTH) {
    return input;
  }

  const declaredLength = input.readUInt32BE(1);
  if (declaredLength === input.length - HEADER_LENGTH) {
    return decodeEnvelopes(input)[0]?.payload ?? Buffer.alloc(0);
  }

  return input;
}
