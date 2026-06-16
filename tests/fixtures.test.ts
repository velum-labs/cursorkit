import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { assertFixture, type ProtocolFixture } from "../src/fixtures/schema.js";
import {
  bodySha256,
  sanitizeFixture,
  sanitizeModelFusionPayload,
} from "../src/fixtures/sanitizer.js";
import {
  assertCursorRunRequestV1,
  assertCursorRunResultV1,
  assertHarnessRunRequestV1,
  assertHarnessRunResultV1,
  cursorRunResultToHarnessRunResult,
} from "../src/fixtures/modelFusion.js";

const MODEL_FUSION_ROOT = join(
  process.cwd(),
  "fixtures",
  "model-fusion-contract",
);

type ModelFusionFixture =
  | "harness-run-request.v1"
  | "harness-run-result.v1"
  | "cursor-run-request.v1"
  | "cursor-run-result.v1";

function readModelFusionFixture(
  schema: ModelFusionFixture,
  variant: "minimal" | "realistic",
): unknown {
  return JSON.parse(
    readFileSync(join(MODEL_FUSION_ROOT, schema, `${variant}.json`), "utf8"),
  );
}

describe("fixtures", () => {
  it("requires sanitized fixture metadata", () => {
    expect(() =>
      assertFixture({ schemaVersion: 1, redaction: { status: "raw" } }),
    ).toThrow(/sanitized/);
  });

  it("sanitizes headers and recomputes body hashes", () => {
    const body = Buffer.from("hello");
    const fixture: ProtocolFixture = {
      schemaVersion: 1,
      cursorVersion: "test",
      protoVersion: "test",
      capturedAt: new Date(0).toISOString(),
      sanitizerVersion: "0",
      redaction: { status: "sanitized" },
      request: {
        httpVersion: "1.1",
        method: "POST",
        path: "/x?token=secret",
        headers: { authorization: "Bearer secret" },
        trailers: {},
        bodySha256: "",
        bodyBase64: body.toString("base64"),
      },
      response: {
        httpVersion: "1.1",
        status: 200,
        path: "/x",
        headers: {},
        trailers: {},
        bodySha256: "",
        bodyBase64: body.toString("base64"),
      },
    };

    const sanitized = sanitizeFixture(fixture);

    expect(sanitized.request.headers.authorization).toBe("[REDACTED]");
    expect(sanitized.request.path).toContain("token=[REDACTED]");
    expect(sanitized.request.bodySha256).toBe(bodySha256(body));
  });

  it("validates generic harness model-fusion fixtures", () => {
    for (const variant of ["minimal", "realistic"] as const) {
      assertHarnessRunRequestV1(
        readModelFusionFixture("harness-run-request.v1", variant),
      );
      assertHarnessRunResultV1(
        readModelFusionFixture("harness-run-result.v1", variant),
      );
    }
  });

  it("validates Cursor-specific model-fusion fixtures", () => {
    for (const variant of ["minimal", "realistic"] as const) {
      assertCursorRunRequestV1(
        readModelFusionFixture("cursor-run-request.v1", variant),
      );
      assertCursorRunResultV1(
        readModelFusionFixture("cursor-run-result.v1", variant),
      );
    }
  });

  it("maps Cursor run results into generic harness results", () => {
    const cursor = readModelFusionFixture("cursor-run-result.v1", "realistic");
    assertCursorRunResultV1(cursor);

    const mapped = cursorRunResultToHarnessRunResult(cursor);

    assertHarnessRunResultV1(mapped);
    expect(mapped.result_id).toBe("harness_result_cursor_001");
    expect(mapped.request_id).toBe("harness_req_cursor_001");
    expect(mapped.harness_kind).toBe("cursor");
    expect(mapped.requested_model).toBe("cursor-local-fixture");
    expect(mapped.observed_model).toBe("provider-local-fixture");
    expect(mapped.model_id).toBe("cursor-local-fixture");
    expect(mapped.endpoint_id).toBe("cursor-local-fixture-endpoint");
    expect(mapped.diagnostics?.[0]?.kind).toBe("capability_missing");
    expect(
      mapped.artifacts?.some(
        (artifact) =>
          artifact.artifact_id === "artifact_cursor_route_inventory_001",
      ),
    ).toBe(true);
    expect(mapped.metadata?.mapped_from_cursor_result_id).toBe(
      "cursor_run_001",
    );
    expect("raw_hash" in mapped).toBe(false);
    expect("redacted_hash" in mapped).toBe(false);
  });

  it("rejects unsupported top-level model-fusion fields", () => {
    const cursor = readModelFusionFixture(
      "cursor-run-result.v1",
      "realistic",
    ) as Record<string, unknown>;
    expect(() =>
      assertCursorRunResultV1({ ...cursor, unsupported_cursor_level: 3 }),
    ).toThrow(/unsupported field/);
  });

  it("computes raw and redacted hashes without persisting secret payloads", () => {
    const rawPayload = "Authorization: Bearer secret-token";
    const sanitized = sanitizeModelFusionPayload({ rawPayload });

    expect(sanitized.redactionStatus).toBe("redacted");
    expect(sanitized.raw_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(sanitized.redacted_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(sanitized.raw_hash).not.toBe(sanitized.redacted_hash);
    expect(sanitized.persistedPayload).toContain("Bearer [REDACTED]");
    expect(sanitized.persistedPayload).not.toContain("secret-token");
  });

  it("CLI fixtures command validates committed model-fusion fixtures", () => {
    const result = spawnSync(
      process.execPath,
      ["dist/src/cli.js", "fixtures"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Validated 8 model-fusion fixture file(s)");
  });
});
