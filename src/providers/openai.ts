import type { LocalModelConfig } from "../config.js";
import type { Logger } from "../logger.js";
import type { ModelProvider } from "../models/registry.js";
import {
  emitTrace,
  newSpanId,
  TRACE_ID_HEADER,
  TRACE_SPAN_HEADER,
} from "../trace.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: OpenAIToolCall[];
}

export interface OpenAIToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export type OpenAICompletionEvent =
  | { type: "text"; text: string }
  | { type: "tool_calls"; toolCalls: OpenAIToolCall[] };

export type OpenAIBackendErrorCode =
  | "http_error"
  | "malformed_sse"
  | "request_aborted"
  | "request_timeout";

export interface OpenAIStreamOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /**
   * Observability correlation id forwarded to the model backend (gateway) as
   * `x-fusion-trace-id`. The gateway honors it so the Cursor edge shares one
   * observable session with the downstream fusion run.
   */
  traceId?: string;
}

export class OpenAIBackendError extends Error {
  constructor(
    readonly code: OpenAIBackendErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "OpenAIBackendError";
  }
}

export class OpenAIStreamParseError extends OpenAIBackendError {
  constructor(message: string, options?: ErrorOptions) {
    super("malformed_sse", message, options);
    this.name = "OpenAIStreamParseError";
  }
}

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: unknown;
    };
    finish_reason?: string | null;
  }>;
}

interface OpenAIStreamToolCallDelta {
  index?: number;
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface RequestAbortContext {
  signal: AbortSignal;
  timedOut(): boolean;
  dispose(): void;
}

interface OpenAIStreamParserState {
  done: boolean;
  toolCalls: Map<number, OpenAIToolCall>;
}

const DEFAULT_BACKEND_REQUEST_TIMEOUT_MS = 120_000;

export class OpenAICompatibleProvider implements ModelProvider {
  readonly name = "openai-compatible";

  constructor(
    private readonly config: LocalModelConfig,
    private readonly logger?: Logger,
    private readonly options: { logFullPayload: boolean } = {
      logFullPayload: false,
    },
  ) {}

  async *streamCompletion(
    messages: ChatMessage[],
    options: OpenAIStreamOptions = {},
  ): AsyncGenerator<string> {
    for await (const event of this.streamCompletionEvents(
      messages,
      [],
      options,
    )) {
      if (event.type === "text") {
        yield event.text;
      }
    }
  }

  async *streamCompletionEvents(
    messages: ChatMessage[],
    tools: OpenAIToolDefinition[] = [],
    options: OpenAIStreamOptions = {},
  ): AsyncGenerator<OpenAICompletionEvent> {
    if (this.config.hardcodedResponse !== undefined) {
      this.logger?.info("model backend hardcoded response", {
        modelId: this.config.id,
        providerModel: this.config.providerModel,
        responseChars: this.config.hardcodedResponse.length,
      });
      yield { type: "text", text: this.config.hardcodedResponse };
      return;
    }

    const url = `${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const requestBody = {
      model: this.config.providerModel,
      messages,
      stream: true,
      ...(tools.length > 0 ? { tools } : {}),
    };
    const requestTimeoutMs =
      options.timeoutMs ??
      this.config.requestTimeoutMs ??
      DEFAULT_BACKEND_REQUEST_TIMEOUT_MS;
    const traceId = options.traceId ?? process.env.FUSION_TRACE_ID ?? undefined;
    const traceSpan = newSpanId();
    const traceHeaders: Record<string, string> =
      traceId !== undefined
        ? { [TRACE_ID_HEADER]: traceId, [TRACE_SPAN_HEADER]: traceSpan }
        : {};
    emitTrace({
      event_type: "cursor.route",
      traceId,
      spanId: traceSpan,
      modelId: this.config.id,
      payload: {
        message: "model backend request",
        provider_model: this.config.providerModel,
        url,
        tool_count: tools.length,
        message_count: messages.length,
      },
    });
    this.logger?.info("model backend request", {
      modelId: this.config.id,
      providerModel: this.config.providerModel,
      url,
      stream: true,
      requestTimeoutMs,
      toolCount: tools.length,
      toolNames: tools.map((tool) => tool.function.name),
      ...summarizeMessages(messages),
      ...(this.options.logFullPayload
        ? {
            payload: requestBody,
          }
        : {}),
    });
    const started = Date.now();
    const abortContext = createRequestAbortContext(
      requestTimeoutMs,
      options.signal,
    );
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          connection: "close",
          "content-type": "application/json",
          ...(this.config.apiKey
            ? { authorization: `Bearer ${this.config.apiKey}` }
            : {}),
          ...traceHeaders,
        },
        body: JSON.stringify(requestBody),
        signal: abortContext.signal,
      });
    } catch (error) {
      const classified = classifyBackendError(error, abortContext);
      this.logger?.warn("model backend request failed", {
        modelId: this.config.id,
        providerModel: this.config.providerModel,
        url,
        durationMs: Date.now() - started,
        error: classified instanceof Error ? classified.message : String(error),
        code:
          classified instanceof OpenAIBackendError
            ? classified.code
            : undefined,
        cause:
          error instanceof Error && error.cause instanceof Error
            ? error.cause.message
            : undefined,
      });
      abortContext.dispose();
      throw classified;
    }

    if (!response.ok || response.body === null) {
      const body = await response.text().catch(() => "");
      const error = new OpenAIBackendError(
        "http_error",
        `Model backend returned ${response.status}: ${body}`,
      );
      this.logger?.warn("model backend response failed", {
        modelId: this.config.id,
        providerModel: this.config.providerModel,
        url,
        status: response.status,
        durationMs: Date.now() - started,
        bodyPreview: body.slice(0, 500),
        code: error.code,
      });
      abortContext.dispose();
      throw error;
    }

    let chunkCount = 0;
    let responseChars = 0;
    try {
      for await (const text of parseOpenAIStream(
        response.body as AsyncIterable<Uint8Array>,
      )) {
        if (typeof text === "string") {
          chunkCount += 1;
          responseChars += text.length;
          yield { type: "text", text };
        } else if (text.type === "tool_calls") {
          chunkCount += 1;
          yield text;
        }
      }
      this.logger?.info("model backend response complete", {
        modelId: this.config.id,
        providerModel: this.config.providerModel,
        url,
        status: response.status,
        durationMs: Date.now() - started,
        chunkCount,
        responseChars,
      });
      emitTrace({
        event_type: "cursor.route",
        traceId,
        spanId: traceSpan,
        modelId: this.config.id,
        payload: {
          message: "model backend response complete",
          status: response.status,
          duration_ms: Date.now() - started,
          chunk_count: chunkCount,
          response_chars: responseChars,
        },
      });
    } catch (error) {
      const classified = classifyBackendError(error, abortContext);
      this.logger?.warn("model backend stream failed", {
        modelId: this.config.id,
        providerModel: this.config.providerModel,
        url,
        status: response.status,
        durationMs: Date.now() - started,
        chunkCount,
        responseChars,
        error: classified instanceof Error ? classified.message : String(error),
        code:
          classified instanceof OpenAIBackendError
            ? classified.code
            : undefined,
      });
      throw classified;
    } finally {
      abortContext.dispose();
    }
  }
}

function summarizeMessages(messages: ChatMessage[]): {
  messageCount: number;
  messageRoles: string[];
  messageChars: number;
  firstMessagePreviewChars: number | undefined;
  lastMessagePreviewChars: number | undefined;
} {
  return {
    messageCount: messages.length,
    messageRoles: messages.map((message) => message.role),
    messageChars: messages.reduce(
      (total, message) => total + message.content.length,
      0,
    ),
    firstMessagePreviewChars: messagePreviewChars(messages[0]?.content),
    lastMessagePreviewChars: messagePreviewChars(messages.at(-1)?.content),
  };
}

function messagePreviewChars(value: string | undefined): number | undefined {
  return value === undefined
    ? undefined
    : value.replace(/\s+/g, " ").trim().slice(0, 500).length;
}

function preview(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}

export async function* parseOpenAIStream(
  stream: AsyncIterable<Uint8Array>,
): AsyncGenerator<
  string | Extract<OpenAICompletionEvent, { type: "tool_calls" }>
> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  const state: OpenAIStreamParserState = {
    done: false,
    toolCalls: new Map<number, OpenAIToolCall>(),
  };
  for await (const chunk of stream) {
    buffer += decodeStreamText(decoder, chunk, true);
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    yield* parseSseLines(lines, state);
    if (state.done) {
      return;
    }
  }

  buffer += decodeStreamText(decoder, undefined, false);
  if (buffer.length > 0 && !state.done) {
    yield* parseSseLines(buffer.split(/\r?\n/), state);
  }
}

function* parseSseLines(
  lines: string[],
  state: OpenAIStreamParserState,
): Generator<string | Extract<OpenAICompletionEvent, { type: "tool_calls" }>> {
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith(":")) {
      continue;
    }
    if (!trimmed.startsWith("data:")) {
      continue;
    }

    const data = trimmed.slice("data:".length).trim();
    if (data.length === 0) {
      continue;
    }
    if (data === "[DONE]") {
      state.done = true;
      return;
    }

    let parsed: OpenAIStreamChunk;
    try {
      parsed = JSON.parse(data) as OpenAIStreamChunk;
    } catch (error) {
      throw new OpenAIStreamParseError(
        `OpenAI stream contained malformed JSON data: ${preview(data)}`,
        error instanceof Error ? { cause: error } : undefined,
      );
    }
    const content = parsed.choices?.[0]?.delta?.content;
    if (typeof content === "string" && content.length > 0) {
      yield content;
    }
    const deltas = parsed.choices?.[0]?.delta?.tool_calls;
    if (Array.isArray(deltas)) {
      mergeToolCallDeltas(
        state.toolCalls,
        deltas as OpenAIStreamToolCallDelta[],
      );
    }
    if (parsed.choices?.[0]?.finish_reason === "tool_calls") {
      yield {
        type: "tool_calls",
        toolCalls: Array.from(state.toolCalls.values()),
      };
      state.toolCalls.clear();
    }
  }
}

function mergeToolCallDeltas(
  toolCalls: Map<number, OpenAIToolCall>,
  deltas: OpenAIStreamToolCallDelta[],
): void {
  for (const delta of deltas) {
    const index = delta.index ?? toolCalls.size;
    const current =
      toolCalls.get(index) ??
      ({
        id: delta.id ?? `tool-${String(index)}`,
        type: "function",
        function: { name: "", arguments: "" },
      } satisfies OpenAIToolCall);
    if (delta.id !== undefined) {
      current.id = delta.id;
    }
    if (delta.type === "function") {
      current.type = "function";
    }
    if (delta.function?.name !== undefined) {
      current.function.name += delta.function.name;
    }
    if (delta.function?.arguments !== undefined) {
      current.function.arguments += delta.function.arguments;
    }
    toolCalls.set(index, current);
  }
}

function decodeStreamText(
  decoder: TextDecoder,
  chunk: Uint8Array | undefined,
  stream: boolean,
): string {
  try {
    return chunk === undefined
      ? decoder.decode()
      : decoder.decode(chunk, { stream });
  } catch (error) {
    throw new OpenAIStreamParseError(
      "OpenAI stream contained malformed UTF-8",
      error instanceof Error ? { cause: error } : undefined,
    );
  }
}

function createRequestAbortContext(
  timeoutMs: number,
  upstreamSignal: AbortSignal | undefined,
): RequestAbortContext {
  const controller = new AbortController();
  let didTimeout = false;
  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);
  const abortFromUpstream = (): void => controller.abort();
  if (upstreamSignal !== undefined) {
    if (upstreamSignal.aborted) {
      controller.abort();
    } else {
      upstreamSignal.addEventListener("abort", abortFromUpstream, {
        once: true,
      });
    }
  }
  return {
    signal: controller.signal,
    timedOut: () => didTimeout,
    dispose: () => {
      clearTimeout(timer);
      upstreamSignal?.removeEventListener("abort", abortFromUpstream);
    },
  };
}

function classifyBackendError(
  error: unknown,
  abortContext: RequestAbortContext,
): unknown {
  if (error instanceof OpenAIBackendError) {
    return error;
  }
  if (abortContext.signal.aborted) {
    const code = abortContext.timedOut()
      ? "request_timeout"
      : "request_aborted";
    return new OpenAIBackendError(
      code,
      code === "request_timeout"
        ? "Model backend request timed out"
        : "Model backend request was aborted",
      error instanceof Error ? { cause: error } : undefined,
    );
  }
  return error;
}
