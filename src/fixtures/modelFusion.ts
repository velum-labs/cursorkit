import { createHash } from "node:crypto";

export const MODEL_FUSION_SCHEMA_BUNDLE_HASH =
  "sha256:3e8388595aefc8e82962d76e822c514db6552f6ee65e62d487534ef825ad87b8";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ModelFusionStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled"
  | "requires_action"
  | "skipped"
  | "unsupported";

export type ModelFusionSideEffects =
  | "none"
  | "read_only"
  | "writes_workspace"
  | "network"
  | "tool_execution"
  | "unknown";

export type ModelFusionCapabilityStatus =
  | "supported"
  | "unsupported"
  | "degraded"
  | "unknown";

export type ModelFusionHarnessKind =
  | "generic"
  | "cursor"
  | "claude_code"
  | "codex"
  | "openai_responses";

export type ModelFusionArtifactKind =
  | "transcript"
  | "patch"
  | "screenshot"
  | "log"
  | "metrics"
  | "worktree"
  | "other";

export type ModelFusionRedactionStatus = "synthetic" | "redacted" | "raw";

export type ContractMetadata<S extends string> = {
  schema: S;
  schema_version: "v1";
  schema_bundle_hash: string;
  producer: string;
  producer_version: string;
  producer_git_sha: string;
  created_at: string;
};

export type ArtifactRef = {
  artifact_id: string;
  kind: ModelFusionArtifactKind;
  uri?: string;
  hash: string;
  redaction_status?: ModelFusionRedactionStatus;
};

export type ModelFusionDiagnostic = {
  kind: "capability_missing";
  message: string;
  retryable: boolean;
  capability?: string;
  status?: ModelFusionCapabilityStatus;
  requested_status?: ModelFusionCapabilityStatus;
};

export type HarnessRunRequestV1 = ContractMetadata<"harness-run-request.v1"> & {
  request_id: string;
  harness_kind: ModelFusionHarnessKind;
  source_repo: string;
  base_git_sha: string;
  prompt: string;
  prompt_hash: string;
  allowed_tools?: string[];
  side_effects: ModelFusionSideEffects;
  requested_capabilities: Record<string, ModelFusionCapabilityStatus>;
  metadata?: Record<string, JsonValue>;
};

export type HarnessRunResultV1 = ContractMetadata<"harness-run-result.v1"> & {
  result_id: string;
  request_id: string;
  harness_kind: ModelFusionHarnessKind;
  status: ModelFusionStatus;
  candidate_ids: string[];
  output_summary?: string;
  artifacts?: ArtifactRef[];
  capabilities: Record<string, ModelFusionCapabilityStatus>;
  requested_model?: string;
  observed_model?: string;
  model_id?: string;
  endpoint_id?: string;
  diagnostics?: ModelFusionDiagnostic[];
  started_at: string;
  finished_at?: string;
  errors?: Array<{ kind: string; message: string; retryable: boolean }>;
  metadata?: Record<string, JsonValue>;
};

export type CursorRunRequestV1 = ContractMetadata<"cursor-run-request.v1"> & {
  cursor_run_id: string;
  harness_request_id: string;
  workspace_path: string;
  prompt: string;
  prompt_hash: string;
  requested_model?: string;
  allowed_tools?: string[];
  side_effects: ModelFusionSideEffects;
  requested_capabilities: Record<string, ModelFusionCapabilityStatus>;
};

export type CursorRunResultV1 = ContractMetadata<"cursor-run-result.v1"> & {
  cursor_run_id: string;
  harness_request_id: string;
  mapped_harness_result_id?: string;
  status: ModelFusionStatus;
  output_summary: string;
  transcript_artifact?: ArtifactRef;
  artifacts?: ArtifactRef[];
  capabilities: Record<string, ModelFusionCapabilityStatus>;
  requested_model?: string;
  observed_model?: string;
  model_id?: string;
  endpoint_id?: string;
  diagnostics?: ModelFusionDiagnostic[];
  raw_hash: string;
  redacted_hash: string;
};

const STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "canceled",
  "requires_action",
  "skipped",
  "unsupported",
] as const;

const SIDE_EFFECTS = [
  "none",
  "read_only",
  "writes_workspace",
  "network",
  "tool_execution",
  "unknown",
] as const;

const CAPABILITIES = [
  "supported",
  "unsupported",
  "degraded",
  "unknown",
] as const;

const HARNESS_KINDS = [
  "generic",
  "cursor",
  "claude_code",
  "codex",
  "openai_responses",
] as const;

const ARTIFACT_KINDS = [
  "transcript",
  "patch",
  "screenshot",
  "log",
  "metrics",
  "worktree",
  "other",
] as const;

const REDACTION_STATUSES = ["synthetic", "redacted", "raw"] as const;
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;

export function sha256Prefixed(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function cursorRunResultToHarnessRunResult(
  cursor: CursorRunResultV1,
): HarnessRunResultV1 {
  const artifacts = [
    ...(cursor.transcript_artifact ? [cursor.transcript_artifact] : []),
    ...(cursor.artifacts ?? []),
  ];
  return {
    schema: "harness-run-result.v1",
    schema_version: cursor.schema_version,
    schema_bundle_hash: cursor.schema_bundle_hash,
    producer: cursor.producer,
    producer_version: cursor.producer_version,
    producer_git_sha: cursor.producer_git_sha,
    created_at: cursor.created_at,
    result_id:
      cursor.mapped_harness_result_id ??
      `harness_result_${cursor.cursor_run_id.replace(/[^A-Za-z0-9_.:-]/g, "_")}`,
    request_id: cursor.harness_request_id,
    harness_kind: "cursor",
    status: cursor.status,
    candidate_ids: [],
    output_summary: cursor.output_summary,
    ...(artifacts.length > 0 ? { artifacts } : {}),
    capabilities: cursor.capabilities,
    ...(cursor.requested_model !== undefined
      ? { requested_model: cursor.requested_model }
      : {}),
    ...(cursor.observed_model !== undefined
      ? { observed_model: cursor.observed_model }
      : {}),
    ...(cursor.model_id !== undefined ? { model_id: cursor.model_id } : {}),
    ...(cursor.endpoint_id !== undefined
      ? { endpoint_id: cursor.endpoint_id }
      : {}),
    ...(cursor.diagnostics !== undefined
      ? { diagnostics: cursor.diagnostics }
      : {}),
    started_at: cursor.created_at,
    metadata: {
      mapped_from_cursor_result_id: cursor.cursor_run_id,
    },
  };
}

export function assertHarnessRunRequestV1(
  value: unknown,
): asserts value is HarnessRunRequestV1 {
  const record = assertObject(value, "harness-run-request.v1");
  assertAllowedKeys(
    record,
    [
      ...metadataKeys(),
      "request_id",
      "harness_kind",
      "source_repo",
      "base_git_sha",
      "prompt",
      "prompt_hash",
      "allowed_tools",
      "side_effects",
      "requested_capabilities",
      "metadata",
    ],
    "harness-run-request.v1",
  );
  assertMetadata(record, "harness-run-request.v1");
  assertString(record.request_id, "request_id");
  assertEnum(record.harness_kind, HARNESS_KINDS, "harness_kind");
  assertString(record.source_repo, "source_repo");
  assertGitSha(record.base_git_sha, "base_git_sha");
  assertString(record.prompt, "prompt");
  assertHash(record.prompt_hash, "prompt_hash");
  if (record.allowed_tools !== undefined)
    assertStringArray(record.allowed_tools, "allowed_tools");
  assertEnum(record.side_effects, SIDE_EFFECTS, "side_effects");
  assertCapabilityMap(record.requested_capabilities, "requested_capabilities");
  if (record.metadata !== undefined)
    assertJsonRecord(record.metadata, "metadata");
}

export function assertHarnessRunResultV1(
  value: unknown,
): asserts value is HarnessRunResultV1 {
  const record = assertObject(value, "harness-run-result.v1");
  assertAllowedKeys(
    record,
    [
      ...metadataKeys(),
      "result_id",
      "request_id",
      "harness_kind",
      "status",
      "candidate_ids",
      "output_summary",
      "artifacts",
      "capabilities",
      "requested_model",
      "observed_model",
      "model_id",
      "endpoint_id",
      "diagnostics",
      "started_at",
      "finished_at",
      "errors",
      "metadata",
    ],
    "harness-run-result.v1",
  );
  assertMetadata(record, "harness-run-result.v1");
  assertString(record.result_id, "result_id");
  assertString(record.request_id, "request_id");
  assertEnum(record.harness_kind, HARNESS_KINDS, "harness_kind");
  assertEnum(record.status, STATUSES, "status");
  assertStringArray(record.candidate_ids, "candidate_ids");
  if (record.output_summary !== undefined)
    assertString(record.output_summary, "output_summary");
  if (record.artifacts !== undefined)
    assertArtifacts(record.artifacts, "artifacts");
  assertCapabilityMap(record.capabilities, "capabilities");
  if (record.requested_model !== undefined)
    assertString(record.requested_model, "requested_model");
  if (record.observed_model !== undefined)
    assertString(record.observed_model, "observed_model");
  if (record.model_id !== undefined) assertString(record.model_id, "model_id");
  if (record.endpoint_id !== undefined)
    assertString(record.endpoint_id, "endpoint_id");
  if (record.diagnostics !== undefined)
    assertDiagnostics(record.diagnostics, "diagnostics");
  assertDateTime(record.started_at, "started_at");
  if (record.finished_at !== undefined)
    assertDateTime(record.finished_at, "finished_at");
  if (record.errors !== undefined) assertErrors(record.errors, "errors");
  if (record.metadata !== undefined)
    assertJsonRecord(record.metadata, "metadata");
}

export function assertCursorRunRequestV1(
  value: unknown,
): asserts value is CursorRunRequestV1 {
  const record = assertObject(value, "cursor-run-request.v1");
  assertAllowedKeys(
    record,
    [
      ...metadataKeys(),
      "cursor_run_id",
      "harness_request_id",
      "workspace_path",
      "prompt",
      "prompt_hash",
      "requested_model",
      "allowed_tools",
      "side_effects",
      "requested_capabilities",
    ],
    "cursor-run-request.v1",
  );
  assertMetadata(record, "cursor-run-request.v1");
  assertString(record.cursor_run_id, "cursor_run_id");
  assertString(record.harness_request_id, "harness_request_id");
  assertString(record.workspace_path, "workspace_path");
  assertString(record.prompt, "prompt");
  assertHash(record.prompt_hash, "prompt_hash");
  if (record.requested_model !== undefined)
    assertString(record.requested_model, "requested_model");
  if (record.allowed_tools !== undefined)
    assertStringArray(record.allowed_tools, "allowed_tools");
  assertEnum(record.side_effects, SIDE_EFFECTS, "side_effects");
  assertCapabilityMap(record.requested_capabilities, "requested_capabilities");
}

export function assertCursorRunResultV1(
  value: unknown,
): asserts value is CursorRunResultV1 {
  const record = assertObject(value, "cursor-run-result.v1");
  assertAllowedKeys(
    record,
    [
      ...metadataKeys(),
      "cursor_run_id",
      "harness_request_id",
      "mapped_harness_result_id",
      "status",
      "output_summary",
      "transcript_artifact",
      "artifacts",
      "capabilities",
      "requested_model",
      "observed_model",
      "model_id",
      "endpoint_id",
      "diagnostics",
      "raw_hash",
      "redacted_hash",
    ],
    "cursor-run-result.v1",
  );
  assertMetadata(record, "cursor-run-result.v1");
  assertString(record.cursor_run_id, "cursor_run_id");
  assertString(record.harness_request_id, "harness_request_id");
  if (record.mapped_harness_result_id !== undefined) {
    assertString(record.mapped_harness_result_id, "mapped_harness_result_id");
  }
  assertEnum(record.status, STATUSES, "status");
  assertString(record.output_summary, "output_summary");
  if (record.transcript_artifact !== undefined) {
    assertArtifact(record.transcript_artifact, "transcript_artifact");
  }
  if (record.artifacts !== undefined)
    assertArtifacts(record.artifacts, "artifacts");
  assertCapabilityMap(record.capabilities, "capabilities");
  if (record.requested_model !== undefined)
    assertString(record.requested_model, "requested_model");
  if (record.observed_model !== undefined)
    assertString(record.observed_model, "observed_model");
  if (record.model_id !== undefined) assertString(record.model_id, "model_id");
  if (record.endpoint_id !== undefined)
    assertString(record.endpoint_id, "endpoint_id");
  if (record.diagnostics !== undefined)
    assertDiagnostics(record.diagnostics, "diagnostics");
  assertHash(record.raw_hash, "raw_hash");
  assertHash(record.redacted_hash, "redacted_hash");
}

function metadataKeys(): string[] {
  return [
    "schema",
    "schema_version",
    "schema_bundle_hash",
    "producer",
    "producer_version",
    "producer_git_sha",
    "created_at",
  ];
}

function assertMetadata(record: Record<string, unknown>, schema: string): void {
  if (record.schema !== schema) throw new Error(`schema must be ${schema}`);
  if (record.schema_version !== "v1")
    throw new Error("schema_version must be v1");
  assertHash(record.schema_bundle_hash, "schema_bundle_hash");
  assertString(record.producer, "producer");
  assertString(record.producer_version, "producer_version");
  assertGitSha(record.producer_git_sha, "producer_git_sha");
  assertDateTime(record.created_at, "created_at");
}

function assertArtifact(
  value: unknown,
  context: string,
): asserts value is ArtifactRef {
  const artifact = assertObject(value, context);
  assertAllowedKeys(
    artifact,
    ["artifact_id", "kind", "uri", "hash", "redaction_status"],
    context,
  );
  assertString(artifact.artifact_id, `${context}.artifact_id`);
  assertEnum(artifact.kind, ARTIFACT_KINDS, `${context}.kind`);
  if (artifact.uri !== undefined) assertString(artifact.uri, `${context}.uri`);
  assertHash(artifact.hash, `${context}.hash`);
  if (artifact.redaction_status !== undefined) {
    assertEnum(
      artifact.redaction_status,
      REDACTION_STATUSES,
      `${context}.redaction_status`,
    );
  }
}

function assertArtifacts(
  value: unknown,
  context: string,
): asserts value is ArtifactRef[] {
  if (!Array.isArray(value)) throw new Error(`${context} must be an array`);
  value.forEach((artifact, index) =>
    assertArtifact(artifact, `${context}[${index}]`),
  );
}

function assertCapabilityMap(value: unknown, context: string): void {
  const record = assertObject(value, context);
  for (const [key, item] of Object.entries(record)) {
    if (typeof key !== "string" || key.length === 0) {
      throw new Error(`${context} capability keys must be non-empty strings`);
    }
    assertEnum(item, CAPABILITIES, `${context}.${key}`);
  }
}

function assertErrors(value: unknown, context: string): void {
  if (!Array.isArray(value)) throw new Error(`${context} must be an array`);
  for (const [index, error] of value.entries()) {
    const record = assertObject(error, `${context}[${index}]`);
    assertAllowedKeys(
      record,
      ["kind", "message", "retryable"],
      `${context}[${index}]`,
    );
    assertString(record.kind, `${context}[${index}].kind`);
    assertString(record.message, `${context}[${index}].message`);
    if (typeof record.retryable !== "boolean") {
      throw new Error(`${context}[${index}].retryable must be a boolean`);
    }
  }
}

function assertDiagnostics(value: unknown, context: string): void {
  if (!Array.isArray(value)) throw new Error(`${context} must be an array`);
  for (const [index, diagnostic] of value.entries()) {
    const record = assertObject(diagnostic, `${context}[${index}]`);
    assertAllowedKeys(
      record,
      [
        "kind",
        "message",
        "retryable",
        "capability",
        "status",
        "requested_status",
      ],
      `${context}[${index}]`,
    );
    if (record.kind !== "capability_missing") {
      throw new Error(`${context}[${index}].kind must be capability_missing`);
    }
    assertString(record.message, `${context}[${index}].message`);
    if (typeof record.retryable !== "boolean") {
      throw new Error(`${context}[${index}].retryable must be a boolean`);
    }
    if (record.capability !== undefined) {
      assertString(record.capability, `${context}[${index}].capability`);
    }
    if (record.status !== undefined) {
      assertEnum(record.status, CAPABILITIES, `${context}[${index}].status`);
    }
    if (record.requested_status !== undefined) {
      assertEnum(
        record.requested_status,
        CAPABILITIES,
        `${context}[${index}].requested_status`,
      );
    }
  }
}

function assertObject(
  value: unknown,
  context: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertAllowedKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  context: string,
): void {
  const set = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!set.has(key))
      throw new Error(`${context}.${key} is an unsupported field`);
  }
}

function assertString(
  value: unknown,
  context: string,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${context} must be a non-empty string`);
  }
}

function assertStringArray(
  value: unknown,
  context: string,
): asserts value is string[] {
  if (!Array.isArray(value)) throw new Error(`${context} must be an array`);
  value.forEach((item, index) => assertString(item, `${context}[${index}]`));
}

function assertHash(value: unknown, context: string): asserts value is string {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) {
    throw new Error(`${context} must be a sha256-prefixed hash`);
  }
}

function assertGitSha(
  value: unknown,
  context: string,
): asserts value is string {
  if (typeof value !== "string" || !GIT_SHA_PATTERN.test(value)) {
    throw new Error(`${context} must be a git SHA`);
  }
}

function assertDateTime(
  value: unknown,
  context: string,
): asserts value is string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`${context} must be an ISO datetime string`);
  }
}

function assertEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  context: string,
): asserts value is T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`${context} must be one of ${allowed.join(", ")}`);
  }
}

function assertJsonRecord(
  value: unknown,
  context: string,
): asserts value is Record<string, JsonValue> {
  const record = assertObject(value, context);
  for (const [key, item] of Object.entries(record)) {
    assertJsonValue(item, `${context}.${key}`);
  }
}

function assertJsonValue(
  value: unknown,
  context: string,
): asserts value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error(`${context} must be JSON-safe`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertJsonValue(item, `${context}[${index}]`),
    );
    return;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      assertJsonValue(item, `${context}.${key}`);
    }
    return;
  }
  throw new Error(`${context} must be JSON-safe`);
}
