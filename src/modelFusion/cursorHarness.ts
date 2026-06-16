import { CURSOR_TOOL_SURFACE } from "../agentTools/surface.js";
import {
  assertCursorRunRequestV1,
  assertCursorRunResultV1,
  assertHarnessRunRequestV1,
  assertHarnessRunResultV1,
  cursorRunResultToHarnessRunResult,
  MODEL_FUSION_SCHEMA_BUNDLE_HASH,
  sha256Prefixed,
} from "../fixtures/modelFusion.js";
import type {
  ArtifactRef,
  CursorRunRequestV1,
  CursorRunResultV1,
  HarnessRunRequestV1,
  HarnessRunResultV1,
  JsonValue,
  ModelFusionCapabilityStatus,
  ModelFusionDiagnostic,
} from "../fixtures/modelFusion.js";
import { sanitizeModelFusionPayload } from "../fixtures/sanitizer.js";

export type CursorCapabilityPolicy = "record-and-degrade" | "fail-closed";

export type CursorHarnessModel = {
  id: string;
  model: string;
  endpointId?: string;
};

export type CursorRouteInventorySummary = {
  observedRoutes: number;
  passThroughRoutes: number;
  interceptedRoutes: number;
  degradedRoutes?: number;
  observedPaths?: string[];
  failedRouteCount?: number;
  diagnosis?: string[];
};

export type CursorCandidateEvidence = {
  transcript?: string;
  diff?: string;
  log?: string;
  outputSummary?: string;
  rawPayload?: string;
  observedModel?: string;
  modelResolutionStatus?: CursorModelResolutionStatus;
  modelResolutionReason?: string;
  routeInventory?: CursorRouteInventorySummary;
  routeInventoryArtifact?: ArtifactRef;
};

export type CursorHarnessOptions = {
  capabilityPolicy?: CursorCapabilityPolicy;
  artifactBaseUri?: string;
  producer?: string;
  producerVersion?: string;
  producerGitSha?: string;
  now?: () => Date;
};

export type RunCursorCandidateInput = {
  request: HarnessRunRequestV1;
  candidateId: string;
  model: CursorHarnessModel;
  workspacePath?: string;
  worktreePath?: string;
  timeoutMs?: number;
  requestedModel?: string;
  requiredCapabilities?: string[];
  evidence?: CursorCandidateEvidence;
  metadata?: Record<string, JsonValue>;
};

export type CursorCapabilityIssue = {
  capability: string;
  status: ModelFusionCapabilityStatus;
  requestedStatus?: ModelFusionCapabilityStatus;
  reason: string;
};

export type CursorModelResolutionStatus =
  | "matched"
  | "unknown"
  | "blocked_override";

export type CursorModelEvidence = {
  requestedModel: string;
  observedModel: string;
  modelId: string;
  endpointId: string;
  status: CursorModelResolutionStatus;
  reason: string;
};

export type RunCursorCandidateOutput = {
  cursorRequest: CursorRunRequestV1;
  cursorResult: CursorRunResultV1;
  harnessResult: HarnessRunResultV1;
  missingCapabilities: CursorCapabilityIssue[];
  metadata: Record<string, JsonValue>;
};

export type CursorHarness = {
  id: "cursor";
  capabilities(): Record<string, ModelFusionCapabilityStatus>;
  runCursorCandidate(input: RunCursorCandidateInput): RunCursorCandidateOutput;
};

export class CursorCapabilityError extends Error {
  readonly issues: CursorCapabilityIssue[];

  constructor(issues: CursorCapabilityIssue[]) {
    super(
      `Cursor candidate is missing required capabilities: ${issues.map((issue) => issue.capability).join(", ")}`,
    );
    this.name = "CursorCapabilityError";
    this.issues = issues;
  }
}

const DEFAULT_PRODUCER = "cursorkit-model-fusion";
const DEFAULT_VERSION = "0.1.0";
const DEFAULT_GIT_SHA = "0".repeat(40);

const CORE_CAPABILITIES: Record<string, ModelFusionCapabilityStatus> = {
  workspace_read: "supported",
  route_observation: "degraded",
  apply_patch: "unsupported",
  tool_call_loop: "unsupported",
};

export function cursorHarness(
  options: CursorHarnessOptions = {},
): CursorHarness {
  return {
    id: "cursor",
    capabilities: () => cursorCapabilities(),
    runCursorCandidate: (input) => runCursorCandidate(input, options),
  };
}

export function runCursorCandidate(
  input: RunCursorCandidateInput,
  options: CursorHarnessOptions = {},
): RunCursorCandidateOutput {
  assertHarnessRunRequestV1(input.request);
  const capabilityPolicy = options.capabilityPolicy ?? "record-and-degrade";
  const capabilities = effectiveCapabilities(
    cursorCapabilities(),
    input.request.requested_capabilities,
  );
  const overrideIssues = capabilityOverrideIssues(
    input.request.requested_capabilities,
    capabilities,
  );
  const missingCapabilities = capabilityIssues(
    input.requiredCapabilities ?? [],
    capabilities,
  );
  const diagnostics = diagnosticsFor([
    ...overrideIssues,
    ...missingCapabilities,
  ]);
  if (capabilityPolicy === "fail-closed" && diagnostics.length > 0) {
    throw new CursorCapabilityError([
      ...overrideIssues,
      ...missingCapabilities,
    ]);
  }

  const now = (options.now ?? (() => new Date()))().toISOString();
  const cursorRunId = `cursor_run_${safeId(input.candidateId)}`;
  const modelEvidence = resolveCursorModelEvidence(input);
  const artifactBaseUri = options.artifactBaseUri ?? "fixture://cursor";
  const rawPayload =
    input.evidence?.rawPayload ??
    JSON.stringify({
      prompt: input.request.prompt,
      candidateId: input.candidateId,
      model: modelEvidence.requestedModel,
    });
  const sanitized = sanitizeModelFusionPayload({ rawPayload });
  const transcriptArtifact: ArtifactRef = {
    artifact_id: `artifact_${safeId(input.candidateId)}_cursor_transcript`,
    kind: "transcript",
    uri: `${artifactBaseUri}/${safeId(input.candidateId)}-transcript-redacted.json`,
    hash: sanitized.redacted_hash,
    redaction_status: sanitized.redactionStatus,
  };
  const routeInventoryArtifact =
    input.evidence?.routeInventoryArtifact ??
    (input.evidence?.routeInventory
      ? routeInventoryArtifactFor({
          candidateId: input.candidateId,
          artifactBaseUri,
          summary: input.evidence.routeInventory,
        })
      : undefined);
  const artifacts = [
    ...(input.evidence?.diff
      ? [
          {
            artifact_id: `artifact_${safeId(input.candidateId)}_cursor_patch`,
            kind: "patch" as const,
            uri: `${artifactBaseUri}/${safeId(input.candidateId)}.patch`,
            hash: sha256Prefixed(input.evidence.diff),
            redaction_status: "redacted" as const,
          },
        ]
      : []),
    ...(input.evidence?.log
      ? [
          {
            artifact_id: `artifact_${safeId(input.candidateId)}_cursor_log`,
            kind: "log" as const,
            uri: `${artifactBaseUri}/${safeId(input.candidateId)}.log`,
            hash: sha256Prefixed(input.evidence.log),
            redaction_status: "redacted" as const,
          },
        ]
      : []),
    ...(routeInventoryArtifact ? [routeInventoryArtifact] : []),
  ];

  const cursorRequest: CursorRunRequestV1 = {
    ...metadata("cursor-run-request.v1", options, now),
    cursor_run_id: cursorRunId,
    harness_request_id: input.request.request_id,
    workspace_path: input.workspacePath ?? input.worktreePath ?? ".",
    prompt: input.request.prompt,
    prompt_hash: input.request.prompt_hash,
    requested_model: modelEvidence.requestedModel,
    allowed_tools: input.request.allowed_tools ?? supportedCursorToolNames(),
    side_effects: input.request.side_effects,
    requested_capabilities: input.request.requested_capabilities,
  };

  const cursorResult: CursorRunResultV1 = {
    ...metadata("cursor-run-result.v1", options, now),
    cursor_run_id: cursorRunId,
    harness_request_id: input.request.request_id,
    mapped_harness_result_id: `harness_result_${safeId(input.candidateId)}`,
    status: "succeeded",
    output_summary:
      input.evidence?.outputSummary ??
      `Cursor candidate ${input.candidateId} recorded fixture-backed evidence.`,
    transcript_artifact: transcriptArtifact,
    ...(artifacts.length > 0 ? { artifacts } : {}),
    capabilities,
    requested_model: modelEvidence.requestedModel,
    observed_model: modelEvidence.observedModel,
    model_id: modelEvidence.modelId,
    endpoint_id: modelEvidence.endpointId,
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    raw_hash: sanitized.raw_hash,
    redacted_hash: sanitized.redacted_hash,
  };

  assertCursorRunRequestV1(cursorRequest);
  assertCursorRunResultV1(cursorResult);
  const mapped = cursorRunResultToHarnessRunResult(cursorResult);
  const harnessResult: HarnessRunResultV1 = {
    ...mapped,
    candidate_ids: [input.candidateId],
    metadata: {
      ...(mapped.metadata ?? {}),
      candidate_id: input.candidateId,
      model_id: input.model.id,
      model: input.model.model,
      endpoint_id: input.model.endpointId ?? input.model.id,
      requested_model: modelEvidence.requestedModel,
      observed_model: modelEvidence.observedModel,
      model_resolution_status: modelEvidence.status,
      model_resolution_reason: modelEvidence.reason,
      ...(input.worktreePath ? { worktree_path: input.worktreePath } : {}),
      missing_capabilities: missingCapabilities,
      route_inventory: input.evidence?.routeInventory ?? null,
      ...(routeInventoryArtifact
        ? { route_inventory_evidence: routeInventoryArtifact }
        : {}),
      ...(input.metadata ?? {}),
    },
  };
  assertHarnessRunResultV1(harnessResult);

  return {
    cursorRequest,
    cursorResult,
    harnessResult,
    missingCapabilities,
    metadata: harnessResult.metadata ?? {},
  };
}

export function cursorCapabilities(): Record<
  string,
  ModelFusionCapabilityStatus
> {
  const toolCapabilities: Record<string, ModelFusionCapabilityStatus> = {};
  for (const tool of CURSOR_TOOL_SURFACE) {
    if (tool.openAIToolName === undefined) continue;
    toolCapabilities[`tool:${tool.openAIToolName}`] = statusForToolSupport(
      tool.support,
    );
  }
  return { ...CORE_CAPABILITIES, ...toolCapabilities };
}

function effectiveCapabilities(
  actual: Record<string, ModelFusionCapabilityStatus>,
  requested: Record<string, ModelFusionCapabilityStatus>,
): Record<string, ModelFusionCapabilityStatus> {
  const result = { ...actual };
  for (const [capability, requestedStatus] of Object.entries(requested)) {
    const actualStatus = actual[capability] ?? "unknown";
    result[capability] = weakerCapability(actualStatus, requestedStatus);
  }
  return result;
}

function capabilityOverrideIssues(
  requested: Record<string, ModelFusionCapabilityStatus>,
  effective: Record<string, ModelFusionCapabilityStatus>,
): CursorCapabilityIssue[] {
  return Object.entries(requested).flatMap(([capability, requestedStatus]) => {
    const status = effective[capability] ?? "unknown";
    if (capabilityRank(status) >= capabilityRank(requestedStatus)) return [];
    return [
      {
        capability,
        status,
        requestedStatus,
        reason: `Cursor capability ${capability} requested ${requestedStatus} but is ${status}`,
      },
    ];
  });
}

function metadata<S extends string>(
  schema: S,
  options: CursorHarnessOptions,
  createdAt: string,
) {
  return {
    schema,
    schema_version: "v1" as const,
    schema_bundle_hash: MODEL_FUSION_SCHEMA_BUNDLE_HASH,
    producer: options.producer ?? DEFAULT_PRODUCER,
    producer_version: options.producerVersion ?? DEFAULT_VERSION,
    producer_git_sha: options.producerGitSha ?? DEFAULT_GIT_SHA,
    created_at: createdAt,
  };
}

function capabilityIssues(
  required: readonly string[],
  capabilities: Record<string, ModelFusionCapabilityStatus>,
): CursorCapabilityIssue[] {
  return required.flatMap((capability) => {
    const status = capabilities[capability] ?? "unknown";
    if (status === "supported") return [];
    return [
      {
        capability,
        status,
        requestedStatus: "supported",
        reason: `Cursor capability ${capability} is ${status}`,
      },
    ];
  });
}

function diagnosticsFor(
  issues: readonly CursorCapabilityIssue[],
): ModelFusionDiagnostic[] {
  const seen = new Set<string>();
  return issues.flatMap((issue) => {
    const key = `${issue.capability}:${issue.status}:${issue.requestedStatus ?? ""}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [
      {
        kind: "capability_missing",
        message: issue.reason,
        retryable: false,
        capability: issue.capability,
        status: issue.status,
        ...(issue.requestedStatus
          ? { requested_status: issue.requestedStatus }
          : {}),
      },
    ];
  });
}

function weakerCapability(
  actual: ModelFusionCapabilityStatus,
  requested: ModelFusionCapabilityStatus,
): ModelFusionCapabilityStatus {
  return capabilityRank(actual) <= capabilityRank(requested)
    ? actual
    : requested;
}

function capabilityRank(status: ModelFusionCapabilityStatus): number {
  switch (status) {
    case "supported":
      return 3;
    case "degraded":
      return 2;
    case "unsupported":
      return 1;
    case "unknown":
      return 0;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function resolveCursorModelEvidence(
  input: RunCursorCandidateInput,
): CursorModelEvidence {
  const requestedModel = input.requestedModel ?? input.model.model;
  const observedModel = input.evidence?.observedModel ?? input.model.model;
  const explicitStatus = input.evidence?.modelResolutionStatus;
  const status =
    explicitStatus ??
    (requestedModel === observedModel
      ? "matched"
      : observedModel === "unknown"
        ? "unknown"
        : "blocked_override");
  return {
    requestedModel,
    observedModel,
    modelId: input.model.id,
    endpointId: input.model.endpointId ?? input.model.id,
    status,
    reason:
      input.evidence?.modelResolutionReason ??
      (status === "matched"
        ? "requested model matched observed provider model"
        : status === "unknown"
          ? "observed model was not available in fixture evidence"
          : "requested model override did not match observed provider model"),
  };
}

function routeInventoryArtifactFor(input: {
  candidateId: string;
  artifactBaseUri: string;
  summary: CursorRouteInventorySummary;
}): ArtifactRef {
  const payload = stableJson({
    schema: "route-inventory-evidence.v1",
    redaction_status: "redacted",
    desktop_route_stability: "observed-only",
    summary: input.summary,
  });
  return {
    artifact_id: `artifact_${safeId(input.candidateId)}_route_inventory`,
    kind: "metrics",
    uri: `${input.artifactBaseUri}/${safeId(input.candidateId)}-route-inventory.json`,
    hash: sha256Prefixed(payload),
    redaction_status: "redacted",
  };
}

function stableJson(value: JsonValue): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key] ?? null)}`)
    .join(",")}}`;
}

function statusForToolSupport(support: string): ModelFusionCapabilityStatus {
  switch (support) {
    case "supported":
      return "supported";
    case "policy-gated":
      return "degraded";
    case "internal":
    case "not-supported":
      return "unsupported";
    default:
      return "unknown";
  }
}

function supportedCursorToolNames(): string[] {
  return CURSOR_TOOL_SURFACE.flatMap((tool) =>
    tool.openAIToolName === undefined ||
    statusForToolSupport(tool.support) === "unsupported"
      ? []
      : [tool.openAIToolName],
  );
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:-]/g, "_");
}
