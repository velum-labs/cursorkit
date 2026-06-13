import { randomUUID } from "node:crypto";

import type { BridgeConfig } from "./config.js";
import { encodeMessage, type CursorProto } from "./proto.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function cursorRequestToOpenAI(value: Record<string, unknown>): ChatMessage[] {
  const wrapped = value.streamUnifiedChatRequest as Record<string, unknown> | undefined;
  const conversation = Array.isArray(wrapped?.conversation) ? wrapped.conversation : [];
  const messages: ChatMessage[] = [];

  for (const item of conversation) {
    if (!isRecord(item)) {
      continue;
    }

    const content = typeof item.text === "string" ? item.text : "";
    if (content.length === 0) {
      continue;
    }

    messages.push({
      role: item.type === 2 ? "assistant" : "user",
      content,
    });
  }

  if (messages.length === 0) {
    messages.push({ role: "user", content: "Hello" });
  }

  return messages;
}

export function buildAvailableModels(proto: CursorProto, modelName: string): Buffer {
  return encodeMessage(proto.AvailableModelsResponse, {
    modelNames: [modelName],
    models: [
      {
        name: modelName,
        defaultOn: true,
        isChatOnly: false,
        supportsAgent: true,
        supportsThinking: false,
        supportsImages: false,
        supportsAutoContext: false,
        supportsMaxMode: false,
        supportsNonMaxMode: true,
        supportsPlanMode: true,
        supportsSandboxing: false,
        supportsCmdK: false,
        clientDisplayName: modelName,
        serverModelName: modelName,
        inputboxShortModelName: modelName,
        contextTokenLimit: 128000,
      },
    ],
    composerModelConfig: { defaultModel: modelName },
    cmdKModelConfig: { defaultModel: modelName },
    backgroundComposerModelConfig: { defaultModel: modelName },
    planExecutionModelConfig: { defaultModel: modelName },
    specModelConfig: { defaultModel: modelName },
    deepSearchModelConfig: { defaultModel: modelName },
    quickAgentModelConfig: { defaultModel: modelName },
    useModelParameters: false,
  });
}

export function buildCursorTextChunk(proto: CursorProto, text: string): Buffer {
  return encodeMessage(proto.StreamUnifiedChatResponseWithTools, {
    streamUnifiedChatResponse: {
      text,
      serverBubbleId: randomUUID(),
    },
    eventId: randomUUID(),
  });
}

export async function* streamModelCompletion(
  config: BridgeConfig,
  messages: ChatMessage[],
): AsyncGenerator<string> {
  if (config.hardcodedResponse !== undefined) {
    yield config.hardcodedResponse;
    return;
  }

  const response = await fetch(`${config.modelBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(config.modelApiKey ? { authorization: `Bearer ${config.modelApiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.modelName,
      messages,
      stream: true,
    }),
  });

  if (!response.ok || response.body === null) {
    const body = await response.text().catch(() => "");
    throw new Error(`Model backend returned ${response.status}: ${body}`);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) {
        continue;
      }

      const data = trimmed.slice("data:".length).trim();
      if (data === "[DONE]") {
        return;
      }

      const parsed = JSON.parse(data) as OpenAIStreamChunk;
      const content = parsed.choices?.[0]?.delta?.content;
      if (typeof content === "string" && content.length > 0) {
        yield content;
      }
    }
  }
}

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
