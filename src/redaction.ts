const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-cursor-token",
  "x-api-key",
  "api-key",
]);

const SENSITIVE_OBJECT_KEY_PATTERN =
  /authorization|cookie|set-cookie|x-cursor-token|x-api-key|api[-_]?key|(?:^|[-_])token$|access[-_]?token|secret|password/i;

const SECRET_VALUE_PATTERN =
  /(bearer\s+)[a-z0-9._~+/-]+|([?&](?:token|key|api_key|access_token)=)[^&\s]+/gi;

export function redactValue(value: string): string {
  return value.replace(
    SECRET_VALUE_PATTERN,
    (
      _match,
      bearerPrefix: string | undefined,
      queryPrefix: string | undefined,
    ) => {
      if (bearerPrefix !== undefined) {
        return `${bearerPrefix}[REDACTED]`;
      }
      if (queryPrefix !== undefined) {
        return `${queryPrefix}[REDACTED]`;
      }
      return "[REDACTED]";
    },
  );
}

export function redactHeaders(
  headers: Headers | NodeJS.Dict<string | string[] | undefined>,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      result[key] = redactHeaderValue(key, value);
    });
    return result;
  }

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }
    result[key] = redactHeaderValue(
      key,
      Array.isArray(value) ? value.join(", ") : value,
    );
  }
  return result;
}

export function redactHeaderValue(name: string, value: string): string {
  if (SENSITIVE_HEADER_NAMES.has(name.toLowerCase())) {
    return "[REDACTED]";
  }
  return redactValue(value);
}

export function redactForLogging(value: unknown): unknown {
  return redactObjectValue(value, undefined);
}

function redactObjectValue(value: unknown, key: string | undefined): unknown {
  if (key !== undefined && SENSITIVE_OBJECT_KEY_PATTERN.test(key)) {
    return "[REDACTED]";
  }
  if (typeof value === "string") {
    return redactValue(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactObjectValue(item, undefined));
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    result[entryKey] = redactObjectValue(entryValue, entryKey);
  }
  return result;
}
