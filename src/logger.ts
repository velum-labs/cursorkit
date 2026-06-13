import type { LogLevel } from "./config.js";
import { redactValue } from "./redaction.js";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
}

export function createLogger(level: LogLevel): Logger {
  const threshold = LEVELS[level];
  function write(
    entryLevel: LogLevel,
    message: string,
    metadata: Record<string, unknown> = {},
  ): void {
    if (LEVELS[entryLevel] < threshold) {
      return;
    }
    const entry = {
      ts: new Date().toISOString(),
      level: entryLevel,
      message,
      ...metadata,
    };
    const output = redactValue(JSON.stringify(entry));
    if (entryLevel === "error") {
      console.error(output);
    } else if (entryLevel === "warn") {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  return {
    debug: (message, metadata) => write("debug", message, metadata),
    info: (message, metadata) => write("info", message, metadata),
    warn: (message, metadata) => write("warn", message, metadata),
    error: (message, metadata) => write("error", message, metadata),
  };
}
