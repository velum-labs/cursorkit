import { describe, expect, it } from "vitest";

import {
  assertCursorRunRequestV1,
  assertCursorRunResultV1,
  assertHarnessRunRequestV1,
  assertHarnessRunResultV1,
  cursorHarness,
  CursorCapabilityError,
  runCursorCandidate,
} from "../src/modelFusion/index.js";
import type { HarnessRunRequestV1 } from "../src/modelFusion/index.js";

function requestFixture(
  overrides: Partial<HarnessRunRequestV1> = {},
): HarnessRunRequestV1 {
  return {
    schema: "harness-run-request.v1",
    schema_version: "v1",
    schema_bundle_hash:
      "sha256:75792f89c091b6ab4fd317a15fb03fd73438563dceff5ccf9f5d7c752dbf35f3",
    producer: "cursorkit-test",
    producer_version: "0.1.0",
    producer_git_sha: "0".repeat(40),
    created_at: "2026-06-16T00:00:00.000Z",
    request_id: "harness_req_test",
    harness_kind: "cursor",
    source_repo: "cursorkit",
    base_git_sha: "a".repeat(40),
    prompt: "Summarize the fixture.",
    prompt_hash: "sha256:" + "b".repeat(64),
    allowed_tools: ["read_file", "list_dir"],
    side_effects: "read_only",
    requested_capabilities: {
      workspace_read: "supported",
      tool_call_loop: "unsupported",
      apply_patch: "unsupported",
    },
    ...overrides,
  };
}

describe("model-fusion harness API", () => {
  it("exports cursorHarness and runCursorCandidate from the public subpath", async () => {
    const api = await import("cursor-rpc/model-fusion");

    expect(typeof api.cursorHarness).toBe("function");
    expect(typeof api.runCursorCandidate).toBe("function");
  });

  it("produces valid Cursor-specific and generic harness records", () => {
    const request = requestFixture();
    const result = runCursorCandidate({
      request,
      candidateId: "candidate/one",
      model: {
        id: "local",
        model: "local-model",
        endpointId: "local-endpoint",
      },
      workspacePath: "/tmp/cursor-workspace",
      requestedModel: "local-model",
      evidence: {
        rawPayload: "Authorization: Bearer secret-token",
        outputSummary: "Fixture-backed Cursor candidate completed.",
        observedModel: "local-model",
        routeInventory: {
          observedRoutes: 3,
          passThroughRoutes: 1,
          interceptedRoutes: 2,
        },
      },
    });

    assertHarnessRunRequestV1(request);
    assertCursorRunRequestV1(result.cursorRequest);
    assertCursorRunResultV1(result.cursorResult);
    assertHarnessRunResultV1(result.harnessResult);
    expect(result.cursorRequest.cursor_run_id).toBe("cursor_run_candidate_one");
    expect(result.cursorResult.raw_hash).not.toBe(
      result.cursorResult.redacted_hash,
    );
    expect(result.harnessResult.candidate_ids).toEqual(["candidate/one"]);
    expect(result.harnessResult.metadata?.requested_model).toBe("local-model");
    expect(result.harnessResult.metadata?.observed_model).toBe("local-model");
    expect(JSON.stringify(result)).not.toContain("secret-token");
    expect("raw_hash" in result.harnessResult).toBe(false);
    expect("redacted_hash" in result.harnessResult).toBe(false);
  });

  it("record-and-degrade records missing capabilities and succeeds", () => {
    const harness = cursorHarness({ capabilityPolicy: "record-and-degrade" });
    const result = harness.runCursorCandidate({
      request: requestFixture(),
      candidateId: "candidate-degraded",
      model: { id: "local", model: "local-model" },
      requiredCapabilities: ["tool_call_loop"],
    });

    assertHarnessRunResultV1(result.harnessResult);
    expect(result.cursorResult.status).toBe("succeeded");
    expect(result.missingCapabilities).toEqual([
      {
        capability: "tool_call_loop",
        status: "unsupported",
        reason: "Cursor capability tool_call_loop is unsupported",
      },
    ]);
    expect(result.harnessResult.metadata?.missing_capabilities).toEqual(
      result.missingCapabilities,
    );
  });

  it("fail-closed rejects missing required capabilities", () => {
    const harness = cursorHarness({ capabilityPolicy: "fail-closed" });

    expect(() =>
      harness.runCursorCandidate({
        request: requestFixture(),
        candidateId: "candidate-fail",
        model: { id: "local", model: "local-model" },
        requiredCapabilities: ["apply_patch"],
      }),
    ).toThrow(CursorCapabilityError);
  });
});
