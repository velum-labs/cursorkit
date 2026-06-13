import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";

import {
  AiService,
  AvailableModelsResponseSchema,
  ChatService,
  StreamUnifiedChatRequestWithToolsSchema,
} from "../src/gen/aiserver/v1/aiserver_pb.js";

describe("generated proto surface", () => {
  it("generates service descriptors for typed Cursor services", () => {
    expect(AiService.typeName).toBe("aiserver.v1.AiService");
    expect(ChatService.typeName).toBe("aiserver.v1.ChatService");
    expect(
      AiService.methods.some((method) => method.name === "AvailableModels"),
    ).toBe(true);
    expect(
      ChatService.methods.some(
        (method) => method.name === "StreamUnifiedChatWithTools",
      ),
    ).toBe(true);
  });

  it("round-trips allowlisted messages through generated schemas", () => {
    const response = create(AvailableModelsResponseSchema, {
      modelNames: ["local-model"],
    });
    const decoded = fromBinary(
      AvailableModelsResponseSchema,
      toBinary(AvailableModelsResponseSchema, response),
    );
    const chat = create(StreamUnifiedChatRequestWithToolsSchema, {
      streamUnifiedChatRequest: {
        modelDetails: { modelName: "local-model" },
      },
    });

    expect(decoded.modelNames).toEqual(["local-model"]);
    expect(chat.streamUnifiedChatRequest?.modelDetails?.modelName).toBe(
      "local-model",
    );
  });
});
