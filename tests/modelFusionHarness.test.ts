import { describe, expect, it } from "vitest";
import { create, toBinary } from "@bufbuild/protobuf";

import { encodeEndStream, encodeEnvelope } from "../src/connectEnvelope.js";
import {
  AgentServerMessageSchema,
  InteractionUpdateSchema,
  TextDeltaUpdateSchema,
} from "../src/gen/agent/v1/agent_pb.js";
import {
  assertCursorRunRequestV1,
  assertCursorRunResultV1,
  assertHarnessRunRequestV1,
  assertHarnessRunResultV1,
  createCursorBridgeRunClient,
  cursorHarness,
  CursorCapabilityError,
  runRealCursorCandidate,
  runCursorCandidate,
} from "../src/modelFusion/index.js";
import type {
  CursorRunClient,
  HarnessRunRequestV1,
} from "../src/modelFusion/index.js";

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
    expect(typeof api.runRealCursorCandidate).toBe("function");
    expect(typeof api.createCursorBridgeRunClient).toBe("function");
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
        observedModel: "provider-local-model",
        routeInventory: {
          observedRoutes: 3,
          passThroughRoutes: 1,
          interceptedRoutes: 2,
          observedPaths: ["/agent.v1.AgentService/Run"],
          diagnosis: ["desktop routes are observed-only"],
        },
      },
    });

    assertHarnessRunRequestV1(request);
    assertCursorRunRequestV1(result.cursorRequest);
    assertCursorRunResultV1(result.cursorResult);
    assertHarnessRunResultV1(result.harnessResult);
    expect(result.cursorRequest.cursor_run_id).toBe("cursor_run_candidate_one");
    expect(result.cursorResult.requested_model).toBe("local-model");
    expect(result.cursorResult.observed_model).toBe("provider-local-model");
    expect(result.cursorResult.model_id).toBe("local");
    expect(result.cursorResult.endpoint_id).toBe("local-endpoint");
    expect(result.cursorResult.raw_hash).not.toBe(
      result.cursorResult.redacted_hash,
    );
    expect(result.harnessResult.candidate_ids).toEqual(["candidate/one"]);
    expect(result.harnessResult.requested_model).toBe("local-model");
    expect(result.harnessResult.observed_model).toBe("provider-local-model");
    expect(result.harnessResult.metadata?.requested_model).toBe("local-model");
    expect(result.harnessResult.metadata?.observed_model).toBe(
      "provider-local-model",
    );
    expect(result.harnessResult.metadata?.model_resolution_status).toBe(
      "blocked_override",
    );
    expect(result.harnessResult.metadata?.route_inventory).toEqual({
      observedRoutes: 3,
      passThroughRoutes: 1,
      interceptedRoutes: 2,
      observedPaths: ["/agent.v1.AgentService/Run"],
      diagnosis: ["desktop routes are observed-only"],
    });
    expect(
      result.harnessResult.metadata?.route_inventory_evidence,
    ).toMatchObject({
      artifact_id: "artifact_candidate_one_route_inventory",
      kind: "metrics",
      redaction_status: "redacted",
    });
    expect(
      result.cursorResult.artifacts?.some(
        (artifact) =>
          artifact.artifact_id === "artifact_candidate_one_route_inventory",
      ),
    ).toBe(true);
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
        requestedStatus: "supported",
        reason: "Cursor capability tool_call_loop is unsupported",
      },
    ]);
    expect(result.cursorResult.diagnostics).toEqual([
      {
        kind: "capability_missing",
        message: "Cursor capability tool_call_loop is unsupported",
        retryable: false,
        capability: "tool_call_loop",
        status: "unsupported",
        requested_status: "supported",
      },
    ]);
    expect(result.harnessResult.metadata?.missing_capabilities).toEqual(
      result.missingCapabilities,
    );
  });

  it("labels fixture mode as fixture smoke in metadata and artifact URIs", () => {
    const result = runCursorCandidate({
      request: requestFixture(),
      candidateId: "fixture-smoke",
      model: { id: "local", model: "local-model" },
    });

    expect(result.harnessResult.metadata).toMatchObject({
      adapter_mode: "fixture",
      evidence_tier: "smoke",
      fixture: true,
      artifact_base_uri: "fixture://cursor/smoke",
    });
    expect(result.cursorResult.transcript_artifact?.uri).toContain(
      "fixture://cursor/smoke/",
    );
    expect(
      result.harnessResult.artifacts?.every((artifact) =>
        artifact.uri?.startsWith("fixture://cursor/smoke/"),
      ),
    ).toBe(true);
  });

  it("records non-fixture evidence through the real adapter seam", async () => {
    let observedRequestSchema: string | undefined;
    const client: CursorRunClient = {
      capabilities: () => ({ route_observation: "supported" }),
      async run(input) {
        observedRequestSchema = input.cursorRequest.schema;
        assertCursorRunRequestV1(input.cursorRequest);
        expect(input.cursorRequest.workspace_path).toBe("/tmp/cursor-real");
        return {
          outputSummary: "Real adapter completed.",
          transcript:
            "assistant: Real adapter transcript. Authorization: Bearer secret-token",
          rawPayload:
            "Real adapter raw payload Authorization: Bearer secret-token",
          observedModel: "provider-real-model",
          routeInventory: {
            observedRoutes: 1,
            passThroughRoutes: 0,
            interceptedRoutes: 1,
            observedPaths: ["/agent.v1.AgentService/Run"],
          },
          artifacts: [
            {
              kind: "patch",
              content: "diff --git a/file b/file\n+real adapter patch\n",
            },
          ],
          toolEvidence: [
            {
              tool: "read_file",
              status: "observed",
            },
          ],
        };
      },
    };

    const result = await runRealCursorCandidate(
      {
        request: requestFixture(),
        candidateId: "real/one",
        model: {
          id: "local-real",
          model: "real-model",
          endpointId: "real-endpoint",
        },
        workspacePath: "/tmp/cursor-real",
      },
      {
        adapterMode: "real",
        cursorRunClient: client,
        now: () => new Date("2026-06-16T01:00:00.000Z"),
      },
    );

    assertCursorRunRequestV1(result.cursorRequest);
    assertCursorRunResultV1(result.cursorResult);
    assertHarnessRunResultV1(result.harnessResult);
    expect(observedRequestSchema).toBe("cursor-run-request.v1");
    expect(result.harnessResult.metadata).toMatchObject({
      adapter_mode: "real",
      evidence_tier: "real",
      fixture: false,
      route_inventory: {
        observedRoutes: 1,
        passThroughRoutes: 0,
        interceptedRoutes: 1,
        observedPaths: ["/agent.v1.AgentService/Run"],
      },
      tool_evidence_count: 1,
    });
    expect(result.cursorResult.transcript_artifact?.uri).toContain(
      "cursor-bridge://agent-run/real_one/",
    );
    expect(result.cursorResult.artifacts?.[0]?.uri).toContain(
      "cursor-bridge://agent-run/real_one/",
    );
    expect(result.cursorResult.capabilities.apply_patch).toBe("unsupported");
    expect(result.cursorResult.capabilities.tool_call_loop).toBe("unsupported");
    expect(JSON.stringify(result)).not.toContain("secret-token");
    expect(result.cursorResult.raw_hash).not.toBe(
      result.cursorResult.redacted_hash,
    );
  });

  it("real adapter fail-closed rejects unsupported capabilities before invoking the client", async () => {
    let invoked = false;
    const client: CursorRunClient = {
      async run() {
        invoked = true;
        throw new Error("should not run");
      },
    };

    await expect(
      runRealCursorCandidate(
        {
          request: requestFixture(),
          candidateId: "real-fail",
          model: { id: "local", model: "local-model" },
          requiredCapabilities: ["apply_patch"],
        },
        {
          adapterMode: "real",
          cursorRunClient: client,
          capabilityPolicy: "fail-closed",
        },
      ),
    ).rejects.toThrow(CursorCapabilityError);
    expect(invoked).toBe(false);
  });

  it("bridge client wraps the Agent Run route with Connect framing", async () => {
    let observedUrl = "";
    let observedContentType = "";
    let observedBodyBytes = 0;
    const client = createCursorBridgeRunClient({
      bridgeBaseUrl: "http://127.0.0.1:9443",
      fetch: async (url, init) => {
        observedUrl = String(url);
        observedContentType = String(
          (init?.headers as Record<string, string>)["content-type"],
        );
        observedBodyBytes =
          init?.body instanceof Uint8Array ? init.body.byteLength : 0;
        return new Response(
          new Uint8Array([
            ...encodeEnvelope(
              toBinary(
                AgentServerMessageSchema,
                create(AgentServerMessageSchema, {
                  interactionUpdate: create(InteractionUpdateSchema, {
                    textDelta: create(TextDeltaUpdateSchema, {
                      text: "bridge response",
                    }),
                  }),
                }),
              ),
            ),
            ...encodeEndStream(),
          ]),
          {
            status: 200,
            headers: { "content-type": "application/connect+proto" },
          },
        );
      },
    });
    const cursorRequest = runCursorCandidate({
      request: requestFixture(),
      candidateId: "bridge-client",
      model: { id: "local", model: "local-model" },
    }).cursorRequest;

    const result = await client.run({
      cursorRequest,
      candidateId: "bridge-client",
      model: { id: "local", model: "local-model" },
      workspacePath: ".",
      capabilities: {},
    });

    expect(observedUrl).toBe("http://127.0.0.1:9443/agent.v1.AgentService/Run");
    expect(observedContentType).toBe("application/connect+proto");
    expect(observedBodyBytes).toBeGreaterThan(0);
    expect(result.outputSummary).toBe("bridge response");
    expect(result.routeInventory?.observedPaths).toEqual([
      "/agent.v1.AgentService/Run",
    ]);
  });

  it("downgrades requested capabilities instead of upgrading Cursor support", () => {
    const result = runCursorCandidate({
      request: requestFixture({
        requested_capabilities: {
          workspace_read: "supported",
          apply_patch: "supported",
        },
      }),
      candidateId: "candidate-override",
      model: { id: "local", model: "local-model" },
      requiredCapabilities: ["apply_patch"],
    });

    expect(result.cursorResult.capabilities.apply_patch).toBe("unsupported");
    expect(result.cursorResult.diagnostics).toContainEqual({
      kind: "capability_missing",
      message:
        "Cursor capability apply_patch requested supported but is unsupported",
      retryable: false,
      capability: "apply_patch",
      status: "unsupported",
      requested_status: "supported",
    });
  });

  it("records unknown model override diagnostics in metadata", () => {
    const result = runCursorCandidate({
      request: requestFixture(),
      candidateId: "candidate-unknown-model",
      model: { id: "local", model: "local-model" },
      requestedModel: "desktop-only-model",
      evidence: {
        observedModel: "unknown",
        modelResolutionStatus: "unknown",
        modelResolutionReason: "desktop model picker state was not observable",
      },
    });

    expect(result.cursorResult.requested_model).toBe("desktop-only-model");
    expect(result.cursorResult.observed_model).toBe("unknown");
    expect(result.harnessResult.metadata?.model_resolution_status).toBe(
      "unknown",
    );
    expect(result.harnessResult.metadata?.model_resolution_reason).toBe(
      "desktop model picker state was not observable",
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
