import { describe, expect, it } from "vitest";

import { ModelRegistry } from "../src/models/registry.js";

describe("ModelRegistry", () => {
  it("rejects duplicate model ids", () => {
    const registry = new ModelRegistry();
    const model = {
      id: "local",
      displayName: "Local",
      baseUrl: "http://localhost:8080/v1",
      apiKey: "",
      contextTokenLimit: 1000,
      provider: { name: "test", async *streamCompletion() {} },
    };

    registry.register(model);

    expect(() => registry.register(model)).toThrow(/already registered/);
  });
});
