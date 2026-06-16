import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";

import {
  AiService,
  AvailableModelsResponseSchema,
  ChatService,
  StreamUnifiedChatRequestWithToolsSchema,
} from "../src/gen/aiserver/v1/aiserver_pb.js";
import {
  CursorHarnessRunRequestSchema,
  CursorHarnessRunResultSchema,
  CursorHarnessService,
} from "../src/gen/model_fusion/v1/cursor_harness_pb.js";

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
    expect(CursorHarnessService.typeName).toBe(
      "model_fusion.v1.CursorHarnessService",
    );
    expect(
      CursorHarnessService.methods.some(
        (method) => method.name === "RunCursorHarness",
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

  it("round-trips model-fusion Cursor harness transport envelopes", () => {
    const request = create(CursorHarnessRunRequestSchema, {
      cursorRunRequestJson: JSON.stringify({
        schema: "cursor-run-request.v1",
      }),
      harnessRunRequestJson: JSON.stringify({
        schema: "harness-run-request.v1",
      }),
      candidateId: "candidate-one",
      workspacePath: "/tmp/workspace",
    });
    const result = create(CursorHarnessRunResultSchema, {
      cursorRunResultJson: JSON.stringify({
        schema: "cursor-run-result.v1",
      }),
      harnessRunResultJson: JSON.stringify({
        schema: "harness-run-result.v1",
      }),
      artifacts: [
        {
          artifactId: "artifact-one",
          kind: "transcript",
          uri: "cursor-bridge://agent-run/candidate-one/transcript.json",
          sha256:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          redactionStatus: "redacted",
        },
      ],
    });
    const decodedRequest = fromBinary(
      CursorHarnessRunRequestSchema,
      toBinary(CursorHarnessRunRequestSchema, request),
    );
    const decodedResult = fromBinary(
      CursorHarnessRunResultSchema,
      toBinary(CursorHarnessRunResultSchema, result),
    );

    expect(JSON.parse(decodedRequest.cursorRunRequestJson)).toEqual({
      schema: "cursor-run-request.v1",
    });
    expect(decodedResult.artifacts[0]?.artifactId).toBe("artifact-one");
  });
});
