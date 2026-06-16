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
  ModelFusionStatus,
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
};

export type CursorCandidateEvidence = {
  transcript?: string;
  diff?: string;
  log?: string;
  outputSummary?: string;
  rawPayload?: string;
  observedModel?: string;
  routeInventory?: CursorRouteInventorySummary;
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
  const capabilities = {
    ...cursorCapabilities(),
    ...input.request.requested_capabilities,
  };
  const missingCapabilities = capabilityIssues(
    input.requiredCapabilities ?? [],
    capabilities,
  );
  if (capabilityPolicy === "fail-closed" && missingCapabilities.length > 0) {
    throw new CursorCapabilityError(missingCapabilities);
  }

  const now = (options.now ?? (() => new Date()))().toISOString();
  const cursorRunId = `cursor_run_${safeId(input.candidateId)}`;
  const requestedModel = input.requestedModel ?? input.model.model;
  const artifactBaseUri = options.artifactBaseUri ?? "fixture://cursor";
  const rawPayload =
    input.evidence?.rawPayload ??
    JSON.stringify({
      prompt: input.request.prompt,
      candidateId: input.candidateId,
      model: requestedModel,
    });
  const sanitized = sanitizeModelFusionPayload({ rawPayload });
  const transcriptArtifact: ArtifactRef = {
    artifact_id: `artifact_${safeId(input.candidateId)}_cursor_transcript`,
    kind: "transcript",
    uri: `${artifactBaseUri}/${safeId(input.candidateId)}-transcript-redacted.json`,
    hash: sanitized.redacted_hash,
    redaction_status: sanitized.redactionStatus,
  };
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
  ];

  const cursorRequest: CursorRunRequestV1 = {
    ...metadata("cursor-run-request.v1", options, now),
    cursor_run_id: cursorRunId,
    harness_request_id: input.request.request_id,
    workspace_path: input.workspacePath ?? input.worktreePath ?? ".",
    prompt: input.request.prompt,
    prompt_hash: input.request.prompt_hash,
    requested_model: requestedModel,
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
      requested_model: requestedModel,
      ...(input.evidence?.observedModel
        ? { observed_model: input.evidence.observedModel }
        : {}),
      ...(input.worktreePath ? { worktree_path: input.worktreePath } : {}),
      missing_capabilities: missingCapabilities,
      route_inventory: input.evidence?.routeInventory ?? null,
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
        reason: `Cursor capability ${capability} is ${status}`,
      },
    ];
  });
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
