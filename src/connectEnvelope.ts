const HEADER_LENGTH = 5;
const COMPRESSED_FLAG = 0x01;
const END_STREAM_FLAG = 0x02;

export interface ConnectEnvelope {
  flags: number;
  payload: Buffer;
}

export interface EnvelopeParseResult {
  envelopes: ConnectEnvelope[];
  remainder: Buffer;
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
  return encodeEnvelope(
    Buffer.from(JSON.stringify({ metadata }), "utf8"),
    END_STREAM_FLAG,
  );
}

export function isCompressedEnvelope(envelope: ConnectEnvelope): boolean {
  return (envelope.flags & COMPRESSED_FLAG) === COMPRESSED_FLAG;
}

export function isEndStreamEnvelope(envelope: ConnectEnvelope): boolean {
  return (envelope.flags & END_STREAM_FLAG) === END_STREAM_FLAG;
}

export function decodeEnvelopes(input: Buffer): ConnectEnvelope[] {
  const result = parseEnvelopes(input);
  if (result.remainder.length > 0) {
    if (result.remainder.length < HEADER_LENGTH) {
      throw new Error("Truncated Connect envelope header");
    }
    throw new Error("Truncated Connect envelope payload");
  }
  return result.envelopes;
}

export function parseEnvelopes(input: Buffer): EnvelopeParseResult {
  const envelopes: ConnectEnvelope[] = [];
  let offset = 0;

  while (offset < input.length) {
    if (input.length - offset < HEADER_LENGTH) {
      break;
    }

    const flags = input.readUInt8(offset);
    const length = input.readUInt32BE(offset + 1);
    const payloadStart = offset + HEADER_LENGTH;
    const payloadEnd = payloadStart + length;
    if (payloadEnd > input.length) {
      break;
    }

    envelopes.push({
      flags,
      payload: input.subarray(payloadStart, payloadEnd),
    });
    offset = payloadEnd;
  }

  return { envelopes, remainder: input.subarray(offset) };
}

export function firstMessagePayload(input: Buffer): Buffer {
  if (input.length < HEADER_LENGTH) {
    return input;
  }

  const declaredLength = input.readUInt32BE(1);
  if (declaredLength <= input.length - HEADER_LENGTH) {
    try {
      return decodeEnvelopes(input)[0]?.payload ?? Buffer.alloc(0);
    } catch {
      return input;
    }
  }

  return input;
}

export function firstMessageEnvelope(
  input: Buffer,
): ConnectEnvelope | undefined {
  return decodeEnvelopes(input).find(
    (envelope) => !isEndStreamEnvelope(envelope),
  );
}
