import type { LocalModelConfig } from "../config.js";
import type { Logger } from "../logger.js";
import type { ModelProvider } from "../models/registry.js";

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

export class OpenAICompatibleProvider implements ModelProvider {
  readonly name = "openai-compatible";

  constructor(
    private readonly config: LocalModelConfig,
    private readonly logger?: Logger,
    private readonly options: { logFullPayload: boolean } = {
      logFullPayload: false,
    },
  ) {}

  async *streamCompletion(messages: ChatMessage[]): AsyncGenerator<string> {
    for await (const event of this.streamCompletionEvents(messages)) {
      if (event.type === "text") {
        yield event.text;
      }
    }
  }

  async *streamCompletionEvents(
    messages: ChatMessage[],
    tools: OpenAIToolDefinition[] = [],
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
    this.logger?.info("model backend request", {
      modelId: this.config.id,
      providerModel: this.config.providerModel,
      url,
      stream: true,
      toolCount: tools.length,
      ...summarizeMessages(messages),
      ...(this.options.logFullPayload
        ? {
            payload: requestBody,
          }
        : {}),
    });
    const started = Date.now();
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
        },
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      this.logger?.warn("model backend request failed", {
        modelId: this.config.id,
        providerModel: this.config.providerModel,
        url,
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
        cause:
          error instanceof Error && error.cause instanceof Error
            ? error.cause.message
            : undefined,
      });
      throw error;
    }

    if (!response.ok || response.body === null) {
      const body = await response.text().catch(() => "");
      this.logger?.warn("model backend response failed", {
        modelId: this.config.id,
        providerModel: this.config.providerModel,
        url,
        status: response.status,
        durationMs: Date.now() - started,
        bodyPreview: body.slice(0, 500),
      });
      throw new Error(`Model backend returned ${response.status}: ${body}`);
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
    } catch (error) {
      this.logger?.warn("model backend stream failed", {
        modelId: this.config.id,
        providerModel: this.config.providerModel,
        url,
        status: response.status,
        durationMs: Date.now() - started,
        chunkCount,
        responseChars,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

function summarizeMessages(messages: ChatMessage[]): {
  messageCount: number;
  messageRoles: string[];
  messageChars: number;
  firstMessagePreview: string | undefined;
  lastMessagePreview: string | undefined;
} {
  return {
    messageCount: messages.length,
    messageRoles: messages.map((message) => message.role),
    messageChars: messages.reduce(
      (total, message) => total + message.content.length,
      0,
    ),
    firstMessagePreview: preview(messages[0]?.content),
    lastMessagePreview: preview(messages.at(-1)?.content),
  };
}

function preview(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}

export async function* parseOpenAIStream(
  stream: AsyncIterable<Uint8Array>,
): AsyncGenerator<string | Extract<OpenAICompletionEvent, { type: "tool_calls" }>> {
  const decoder = new TextDecoder();
  let buffer = "";
  const toolCalls = new Map<number, OpenAIToolCall>();
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    yield* parseSseLines(lines, toolCalls);
  }

  buffer += decoder.decode();
  if (buffer.length > 0) {
    yield* parseSseLines(buffer.split(/\r?\n/), toolCalls);
  }
}

function* parseSseLines(
  lines: string[],
  toolCalls: Map<number, OpenAIToolCall>,
): Generator<string | Extract<OpenAICompletionEvent, { type: "tool_calls" }>> {
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) {
      continue;
    }

    const data = trimmed.slice("data:".length).trim();
    if (data === "[DONE]") {
      return;
    }

    let parsed: OpenAIStreamChunk;
    try {
      parsed = JSON.parse(data) as OpenAIStreamChunk;
    } catch {
      continue;
    }
    const content = parsed.choices?.[0]?.delta?.content;
    if (typeof content === "string" && content.length > 0) {
      yield content;
    }
    const deltas = parsed.choices?.[0]?.delta?.tool_calls;
    if (Array.isArray(deltas)) {
      mergeToolCallDeltas(toolCalls, deltas as OpenAIStreamToolCallDelta[]);
    }
    if (parsed.choices?.[0]?.finish_reason === "tool_calls") {
      yield { type: "tool_calls", toolCalls: Array.from(toolCalls.values()) };
      toolCalls.clear();
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
