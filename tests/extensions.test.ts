import { describe, expect, it, vi } from "vitest";

import { createExtensionManager } from "../src/extensions/registry.js";
import { createLogger } from "../src/logger.js";
import { ModelRegistry } from "../src/models/registry.js";

describe("extension registry", () => {
  it("loads extensions with the shared context", async () => {
    const manager = createExtensionManager(
      new ModelRegistry(),
      createLogger("error"),
    );
    const setup = vi.fn();

    await manager.load({ name: "test", setup });

    expect(setup).toHaveBeenCalledWith(manager.context);
  });

  it("rejects conflicting route handlers", () => {
    const manager = createExtensionManager(
      new ModelRegistry(),
      createLogger("error"),
    );
    const route = {
      path: "/x",
      bodyAccess: "consume" as const,
      async handle() {
        return true;
      },
    };

    manager.context.routes.register(route);

    expect(() => manager.context.routes.register(route)).toThrow(
      /already registered/,
    );
  });
});
