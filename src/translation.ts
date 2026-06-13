import {
  ConversationMessage_MessageType,
  type StreamUnifiedChatRequestWithTools,
} from "./gen/aiserver/v1/aiserver_pb.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function cursorRequestToOpenAI(
  value: StreamUnifiedChatRequestWithTools,
): ChatMessage[] {
  const conversation = value.streamUnifiedChatRequest?.conversation ?? [];
  const messages: ChatMessage[] = [];

  for (const item of conversation) {
    const content = item.text;
    if (content.length === 0) {
      continue;
    }

    messages.push({
      role:
        item.type ===
        ConversationMessage_MessageType.CONVERSATION_MESSAGE_MESSAGE_TYPE_MESSAGE_TYPE_AI
          ? "assistant"
          : "user",
      content,
    });
  }

  if (messages.length === 0) {
    messages.push({ role: "user", content: "Hello" });
  }

  return messages;
}
