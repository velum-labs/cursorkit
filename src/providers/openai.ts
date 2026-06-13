import type { LocalModelConfig } from "../config.js";
import type { ModelProvider } from "../models/registry.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
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

export class OpenAICompatibleProvider implements ModelProvider {
  readonly name = "openai-compatible";

  constructor(private readonly config: LocalModelConfig) {}

  async *streamCompletion(messages: ChatMessage[]): AsyncGenerator<string> {
    if (this.config.hardcodedResponse !== undefined) {
      yield this.config.hardcodedResponse;
      return;
    }

    const response = await fetch(
      `${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.config.apiKey
            ? { authorization: `Bearer ${this.config.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model: this.config.id,
          messages,
          stream: true,
        }),
      },
    );

    if (!response.ok || response.body === null) {
      const body = await response.text().catch(() => "");
      throw new Error(`Model backend returned ${response.status}: ${body}`);
    }

    yield* parseOpenAIStream(response.body as AsyncIterable<Uint8Array>);
  }
}

export async function* parseOpenAIStream(
  stream: AsyncIterable<Uint8Array>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    yield* parseSseLines(lines);
  }

  buffer += decoder.decode();
  if (buffer.length > 0) {
    yield* parseSseLines(buffer.split(/\r?\n/));
  }
}

function* parseSseLines(lines: string[]): Generator<string> {
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
  }
}
