import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";

import {
  AgentV1_GetUsableModelsResponseSchema,
  AvailableModelsResponseSchema,
  GetDefaultModelResponseSchema,
} from "../src/gen/aiserver/v1/aiserver_pb.js";
import { ModelRegistry } from "../src/models/registry.js";
import {
  mergeAvailableModels,
  mergeDefaultModel,
  mergeUsableModels,
} from "../src/services/models.js";

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

  it("exposes display aliases without replacing the Cursor-facing model id", () => {
    const registry = new ModelRegistry();
    registry.register({
      id: "local-qwen",
      displayName: "Local Qwen",
      baseUrl: "http://127.0.0.1:8080/v1",
      apiKey: "local",
      contextTokenLimit: 32768,
      provider: {
        name: "test",
        streamCompletion: async function* () {},
      },
    });

    const available = fromBinary(
      AvailableModelsResponseSchema,
      mergeAvailableModels(undefined, registry),
    );
    const usable = fromBinary(
      AgentV1_GetUsableModelsResponseSchema,
      mergeUsableModels(undefined, registry),
    );
    const availableModel = available.models.find(
      (model) => model.name === "local-qwen",
    );
    const usableModel = usable.models.find(
      (model) => model.modelId === "local-qwen",
    );

    expect(available.modelNames).toContain("local-qwen");
    expect(available.modelNames).not.toContain("Local Qwen");
    expect(availableModel).toMatchObject({
      name: "local-qwen",
      clientDisplayName: "Local Qwen",
      serverModelName: "local-qwen",
      idAliases: ["local-qwen", "Local Qwen"],
    });
    expect(usableModel).toMatchObject({
      modelId: "local-qwen",
      displayName: "Local Qwen",
      aliases: ["local-qwen", "Local Qwen"],
    });
  });
});
