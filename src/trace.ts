/**
 * fusion-trace-event.v1 emitter for the Cursorkit bridge.
 *
 * Self-contained (no @warrant dependency) mirror of the shared fusion-trace
 * contract so the Cursor edge can appear on the same observable session as the
 * gateway run. Emission is a no-op unless FUSION_TRACE_URL or FUSION_TRACE_DIR
 * is set, so it never affects normal bridge operation.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export const TRACE_ID_HEADER = "x-fusion-trace-id";
export const TRACE_SPAN_HEADER = "x-fusion-span-id";
export const TRACE_PARENT_SPAN_HEADER = "x-fusion-parent-span-id";
export const TRACE_CANDIDATE_HEADER = "x-fusion-candidate-id";

const FUSION_TRACE_EVENT_SCHEMA = "fusion-trace-event.v1";
const FUSION_TRACE_EVENT_VERSION = "1.0.0";

export type CursorTraceEventType =
  | "session.started"
  | "session.finished"
  | "model.call.started"
  | "model.call.finished"
  | "cursor.route"
  | "log";

export interface CursorTraceEvent {
  schema: typeof FUSION_TRACE_EVENT_SCHEMA;
  schema_version: string;
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  seq: number;
  ts: number;
  component: "cursor-bridge";
  event_type: CursorTraceEventType;
  model_id?: string;
  payload?: Record<string, unknown>;
}

export interface EmitInput {
  event_type: CursorTraceEventType;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  modelId?: string;
  payload?: Record<string, unknown>;
}

export function newTraceId(): string {
  return `trace_${randomUUID().replace(/-/g, "")}`;
}

export function newSpanId(): string {
  return `span_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function ambientTraceId(): string | undefined {
  const value = process.env.FUSION_TRACE_ID;
  return value && value.length > 0 ? value : undefined;
}

class CursorTraceEmitter {
  private readonly url?: string;
  private readonly dir?: string;
  private readonly enabled: boolean;
  private seq = 0;
  private dirReady = false;

  constructor() {
    this.url = process.env.FUSION_TRACE_URL ?? undefined;
    this.dir = process.env.FUSION_TRACE_DIR ?? undefined;
    this.enabled = Boolean(this.url ?? this.dir);
  }

  emit(input: EmitInput): void {
    if (!this.enabled) {
      return;
    }
    const traceId = input.traceId ?? ambientTraceId();
    if (traceId === undefined) {
      return;
    }
    const event: CursorTraceEvent = {
      schema: FUSION_TRACE_EVENT_SCHEMA,
      schema_version: FUSION_TRACE_EVENT_VERSION,
      trace_id: traceId,
      span_id: input.spanId ?? newSpanId(),
      seq: this.seq++,
      ts: Date.now(),
      component: "cursor-bridge",
      event_type: input.event_type,
      ...(input.parentSpanId !== undefined ? { parent_span_id: input.parentSpanId } : {}),
      ...(input.modelId !== undefined ? { model_id: input.modelId } : {}),
      ...(input.payload !== undefined ? { payload: input.payload } : {}),
    };
    this.writeJsonl(event);
    void this.post(event);
  }

  private writeJsonl(event: CursorTraceEvent): void {
    if (this.dir === undefined) {
      return;
    }
    try {
      if (!this.dirReady) {
        mkdirSync(this.dir, { recursive: true });
        this.dirReady = true;
      }
      appendFileSync(join(this.dir, `${event.trace_id}.jsonl`), `${JSON.stringify(event)}\n`);
    } catch {
      // best-effort durable fallback
    }
  }

  private async post(event: CursorTraceEvent): Promise<void> {
    if (this.url === undefined) {
      return;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2_000);
      await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: [event] }),
        signal: controller.signal,
      }).catch(() => undefined);
      clearTimeout(timer);
    } catch {
      // collector being down must never break the bridge
    }
  }
}

let emitter: CursorTraceEmitter | undefined;

export function emitTrace(input: EmitInput): void {
  if (emitter === undefined) {
    emitter = new CursorTraceEmitter();
  }
  emitter.emit(input);
}
