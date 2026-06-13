import { describe, expect, it } from "vitest";

import {
  listProtoFiles,
  loadCursorProto,
  resolveProtoDirectory,
} from "../src/proto.js";

describe("full default proto", () => {
  it("loads package-preserving full proto files", async () => {
    const proto = await loadCursorProto();

    expect(proto.AvailableModelsResponse.fullName).toBe(
      ".aiserver.v1.AvailableModelsResponse",
    );
    expect(proto.root.lookupService("agent.v1.AgentService").fullName).toBe(
      ".agent.v1.AgentService",
    );
  });

  it("discovers all default proto files without depending on cwd", () => {
    const files = listProtoFiles(resolveProtoDirectory());

    expect(
      files.some((file) => file.endsWith("aiserver/v1/aiserver.proto")),
    ).toBe(true);
    expect(files.some((file) => file.endsWith("agent/v1/agent.proto"))).toBe(
      true,
    );
  });
});
