import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("rejects non-localhost binds unless explicitly allowed", () => {
    expect(() => loadConfig({ BRIDGE_HOST: "0.0.0.0" })).toThrow(
      /Refusing to bind/,
    );
  });

  it("loads multiple local models from JSON", () => {
    const config = loadConfig({
      BRIDGE_MODELS_JSON: JSON.stringify([
        {
          id: "llama",
          displayName: "Llama",
          baseUrl: "http://localhost:11434/v1",
          contextTokenLimit: 4096,
        },
      ]),
    });

    expect(config.models).toHaveLength(1);
    expect(config.models[0]?.id).toBe("llama");
  });
});
