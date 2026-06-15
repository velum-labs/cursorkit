import { parseOpenAIStream } from "../providers/openai.js";
import type { FailureCode } from "./types.js";

export interface LocalBackendProbeOptions {
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
  checkToolCalls?: boolean;
}

export interface LocalBackendProbeReport {
  ok: boolean;
  failureCode?: FailureCode;
  message: string;
  modelsStatus?: number;
  chatStatus?: number;
  streamingChatStatus?: number;
  toolChatStatus?: number;
  models: string[];
  selectedModelFound?: boolean;
  nonStreamingSupported?: boolean;
  streamingSupported?: boolean;
  toolCallsSupported?: boolean;
  completionPreview?: string;
}

interface OpenAIModelsResponse {
  data?: Array<{ id?: string }>;
}

interface OpenAIChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string };
    delta?: { content?: string };
  }>;
}

export async function probeLocalBackend(
  options: LocalBackendProbeOptions,
): Promise<LocalBackendProbeReport> {
  const models = await fetchModels(options);
  if (!models.ok) {
    return models;
  }
  if (!models.models.includes(options.model)) {
    return {
      ok: false,
      failureCode: "backend_unreachable",
      message: `Model ${options.model} was not returned by /models`,
      modelsStatus: models.modelsStatus,
      models: models.models,
      selectedModelFound: false,
    };
  }

  const chat = await fetchChatCompletion(options);
  if (!chat.ok) {
    return {
      ...chat,
      modelsStatus: models.modelsStatus,
      models: models.models,
      selectedModelFound: true,
    };
  }

  if (options.checkToolCalls === true) {
    const toolCall = await fetchToolCallCompletion(options);
    if (!toolCall.ok) {
      return {
        ...toolCall,
        modelsStatus: models.modelsStatus,
        chatStatus: chat.chatStatus,
        streamingChatStatus: chat.streamingChatStatus,
        models: models.models,
        selectedModelFound: true,
        nonStreamingSupported: chat.nonStreamingSupported,
        streamingSupported: chat.streamingSupported,
      };
    }
    return {
      ok: true,
      message:
        "Local backend returned the selected model, completed a chat probe, and streamed a tool call",
      modelsStatus: models.modelsStatus,
      chatStatus: chat.chatStatus,
      streamingChatStatus: chat.streamingChatStatus,
      toolChatStatus: toolCall.toolChatStatus,
      models: models.models,
      selectedModelFound: true,
      nonStreamingSupported: chat.nonStreamingSupported,
      streamingSupported: chat.streamingSupported,
      toolCallsSupported: true,
      completionPreview: chat.completionPreview,
    };
  }

  return {
    ok: true,
    message: `Local backend returned ${options.model} and completed a chat probe`,
    modelsStatus: models.modelsStatus,
    chatStatus: chat.chatStatus,
    streamingChatStatus: chat.streamingChatStatus,
    models: models.models,
    selectedModelFound: true,
    nonStreamingSupported: chat.nonStreamingSupported,
    streamingSupported: chat.streamingSupported,
    completionPreview: chat.completionPreview,
  };
}

async function fetchModels(
  options: LocalBackendProbeOptions,
): Promise<LocalBackendProbeReport> {
  const url = `${trimTrailingSlash(options.baseUrl)}/models`;
  try {
    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: authHeaders(options.apiKey),
      timeoutMs: options.timeoutMs,
    });
    if (!response.ok) {
      return {
        ok: false,
        failureCode: "backend_unreachable",
        message: `/models returned HTTP ${response.status}`,
        modelsStatus: response.status,
        models: [],
      };
    }
    const json = (await response.json()) as OpenAIModelsResponse;
    return {
      ok: true,
      message: "/models returned model data",
      modelsStatus: response.status,
      models: (json.data ?? [])
        .map((model) => model.id)
        .filter((id): id is string => id !== undefined),
      selectedModelFound: (json.data ?? []).some(
        (model) => model.id === options.model,
      ),
    };
  } catch (error) {
    return {
      ok: false,
      failureCode: "backend_unreachable",
      message: `/models request failed: ${errorMessage(error)}`,
      models: [],
    };
  }
}

async function fetchChatCompletion(
  options: LocalBackendProbeOptions,
): Promise<LocalBackendProbeReport> {
  const url = `${trimTrailingSlash(options.baseUrl)}/chat/completions`;
  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        ...authHeaders(options.apiKey),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        messages: [{ role: "user", content: "Reply with exactly: ok" }],
        max_tokens: 128,
        stream: false,
      }),
      timeoutMs: options.timeoutMs,
    });
    if (!response.ok) {
      return {
        ok: false,
        failureCode: "local_completion_failed",
        message: `/chat/completions returned HTTP ${response.status}`,
        chatStatus: response.status,
        models: [],
      };
    }
    const json = (await response.json()) as OpenAIChatCompletionResponse;
    const content = json.choices?.[0]?.message?.content ?? "";
    if (content.length === 0) {
      return fetchStreamingChatCompletion(options);
    }
    return {
      ok: true,
      message: "/chat/completions returned a response",
      chatStatus: response.status,
      models: [],
      nonStreamingSupported: true,
      streamingSupported: false,
      completionPreview: content.slice(0, 120),
    };
  } catch (error) {
    return {
      ok: false,
      failureCode: "local_completion_failed",
      message: `/chat/completions request failed: ${errorMessage(error)}`,
      models: [],
    };
  }
}

async function fetchStreamingChatCompletion(
  options: LocalBackendProbeOptions,
): Promise<LocalBackendProbeReport> {
  const url = `${trimTrailingSlash(options.baseUrl)}/chat/completions`;
  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        ...authHeaders(options.apiKey),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        messages: [{ role: "user", content: "Reply with exactly: ok" }],
        max_tokens: 128,
        stream: true,
      }),
      timeoutMs: options.timeoutMs,
    });
    if (!response.ok || response.body === null) {
      return {
        ok: false,
        failureCode: "local_completion_failed",
        message: `/chat/completions streaming returned HTTP ${response.status}`,
        streamingChatStatus: response.status,
        models: [],
      };
    }
    let content = "";
    for await (const chunk of parseOpenAIStream(
      response.body as AsyncIterable<Uint8Array>,
    )) {
      if (typeof chunk !== "string") {
        continue;
      }
      content += chunk;
      if (content.length >= 120) {
        break;
      }
    }
    if (content.length === 0) {
      return {
        ok: false,
        failureCode: "local_completion_failed",
        message:
          "/chat/completions returned an empty or malformed non-streaming and streaming completion",
        streamingChatStatus: response.status,
        models: [],
      };
    }
    return {
      ok: true,
      message: "/chat/completions returned a streaming response",
      streamingChatStatus: response.status,
      models: [],
      nonStreamingSupported: false,
      streamingSupported: true,
      completionPreview: content.slice(0, 120),
    };
  } catch (error) {
    return {
      ok: false,
      failureCode: "local_completion_failed",
      message: `/chat/completions streaming request failed: ${errorMessage(error)}`,
      models: [],
    };
  }
}

async function fetchToolCallCompletion(
  options: LocalBackendProbeOptions,
): Promise<LocalBackendProbeReport> {
  const url = `${trimTrailingSlash(options.baseUrl)}/chat/completions`;
  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        ...authHeaders(options.apiKey),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        messages: [{ role: "user", content: "Call the probe_tool function." }],
        stream: true,
        tools: [
          {
            type: "function",
            function: {
              name: "probe_tool",
              description: "A deterministic probe tool.",
              parameters: {
                type: "object",
                properties: { value: { type: "string" } },
                required: ["value"],
              },
            },
          },
        ],
      }),
      timeoutMs: options.timeoutMs,
    });
    if (!response.ok || response.body === null) {
      return {
        ok: false,
        failureCode: "local_completion_failed",
        message: `/chat/completions tool-call streaming returned HTTP ${response.status}`,
        toolChatStatus: response.status,
        models: [],
      };
    }
    for await (const chunk of parseOpenAIStream(
      response.body as AsyncIterable<Uint8Array>,
    )) {
      if (
        typeof chunk !== "string" &&
        chunk.toolCalls.some(
          (toolCall) => toolCall.function.name === "probe_tool",
        )
      ) {
        return {
          ok: true,
          message: "/chat/completions streamed a tool call",
          toolChatStatus: response.status,
          models: [],
          toolCallsSupported: true,
        };
      }
    }
    return {
      ok: false,
      failureCode: "local_completion_failed",
      message: "/chat/completions did not stream a probe tool call",
      toolChatStatus: response.status,
      models: [],
      toolCallsSupported: false,
    };
  } catch (error) {
    return {
      ok: false,
      failureCode: "local_completion_failed",
      message: `/chat/completions tool-call streaming request failed: ${errorMessage(error)}`,
      models: [],
      toolCallsSupported: false,
    };
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs: number },
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function authHeaders(apiKey: string): Record<string, string> {
  return apiKey.length === 0 ? {} : { authorization: `Bearer ${apiKey}` };
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
