export interface ProtocolFixture {
  schemaVersion: 1;
  cursorVersion: string;
  protoVersion: string;
  capturedAt: string;
  sanitizerVersion: string;
  redaction: {
    status: "sanitized";
    notes?: string;
  };
  request: FixtureHttpMessage;
  response: FixtureHttpMessage;
  decoded?: {
    requestType?: string;
    responseType?: string;
  };
}

export interface FixtureHttpMessage {
  httpVersion: string;
  alpn?: string;
  method?: string;
  path: string;
  query?: string;
  status?: number;
  headers: Record<string, string>;
  trailers: Record<string, string>;
  contentType?: string;
  bodySha256: string;
  bodyBase64: string;
}

export function assertFixture(
  value: unknown,
): asserts value is ProtocolFixture {
  if (!isRecord(value)) {
    throw new Error("Fixture must be an object");
  }
  if (value.schemaVersion !== 1) {
    throw new Error("Unsupported fixture schemaVersion");
  }
  if (!isRecord(value.redaction) || value.redaction.status !== "sanitized") {
    throw new Error("Fixture must be sanitized before use");
  }
  assertMessage(value.request, "request");
  assertMessage(value.response, "response");
}

function assertMessage(value: unknown, name: string): void {
  if (!isRecord(value)) {
    throw new Error(`${name} must be an object`);
  }
  for (const field of [
    "httpVersion",
    "path",
    "headers",
    "trailers",
    "bodySha256",
    "bodyBase64",
  ]) {
    if (!(field in value)) {
      throw new Error(`${name}.${field} is required`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
