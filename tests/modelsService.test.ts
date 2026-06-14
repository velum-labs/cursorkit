import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";

import { GetDefaultModelResponseSchema } from "../src/gen/aiserver/v1/aiserver_pb.js";
import { ModelRegistry } from "../src/models/registry.js";
import { mergeDefaultModel } from "../src/services/models.js";

describe("model service helpers", () => {
  it("overrides the desktop default model with the configured local model", () => {
    const registry = new ModelRegistry();
    registry.register({
      id: "local-qwen",
      displayName: "local-qwen",
      baseUrl: "http://127.0.0.1:8080/v1",
      apiKey: "local",
      contextTokenLimit: 32768,
      provider: {
        name: "test",
        streamCompletion: async function* () {},
      },
    });

    const payload = mergeDefaultModel(undefined, registry);
    const response = fromBinary(GetDefaultModelResponseSchema, payload);

    expect(response).toMatchObject({
      model: "local-qwen",
      thinkingModel: "local-qwen",
      maxMode: true,
    });
  });

  it("preserves upstream defaults when no local model is registered", () => {
    const payload = mergeDefaultModel(
      Buffer.from(
        toBinary(
          GetDefaultModelResponseSchema,
          create(GetDefaultModelResponseSchema, {
            model: "gpt-5.5",
            thinkingModel: "gpt-5.5",
            maxMode: true,
          }),
        ),
      ),
      new ModelRegistry(),
    );
    const response = fromBinary(GetDefaultModelResponseSchema, payload);

    expect(response).toMatchObject({
      model: "gpt-5.5",
      thinkingModel: "gpt-5.5",
      maxMode: true,
    });
  });
});
