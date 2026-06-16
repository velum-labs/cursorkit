import { create, fromBinary, toBinary } from "@bufbuild/protobuf";

import { CURSOR_TOOL_SURFACE } from "../agentTools/surface.js";
import {
  decodeEnvelopes,
  encodeEnvelope,
  isEndStreamEnvelope,
} from "../connectEnvelope.js";
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
  ModelFusionStatus,
} from "../fixtures/modelFusion.js";
import { sanitizeModelFusionPayload } from "../fixtures/sanitizer.js";
import {
  AgentClientMessageSchema,
  AgentRunRequestSchema,
  AgentServerMessageSchema,
  ConversationActionSchema,
  RequestedModelSchema,
  UserMessageActionSchema,
  UserMessageSchema,
} from "../gen/agent/v1/agent_pb.js";
import { AGENT_RUN_PATH } from "../routes.js";

export type CursorCapabilityPolicy = "record-and-degrade" | "fail-closed";

export type CursorHarnessModel = {
  id: string;
  model: string;
  endpointId?: string;
};

export type CursorAdapterMode = "fixture" | "real";
export type CursorEvidenceTier = "smoke" | "real";

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
  artifacts?: CursorArtifactEvidence[];
  toolEvidence?: Record<string, JsonValue>[];
};

export type CursorArtifactEvidence = {
  artifactId?: string;
  kind: ArtifactRef["kind"];
  uri?: string;
  content?: string;
  hash?: string;
  redactionStatus?: ArtifactRef["redaction_status"];
};

export type CursorHarnessBaseOptions = {
  capabilityPolicy?: CursorCapabilityPolicy;
  artifactBaseUri?: string;
  producer?: string;
  producerVersion?: string;
  producerGitSha?: string;
  now?: () => Date;
};

export type CursorFixtureHarnessOptions = CursorHarnessBaseOptions & {
  adapterMode?: "fixture";
};

export type CursorRealHarnessOptions = CursorHarnessBaseOptions & {
  adapterMode: "real";
  cursorRunClient: CursorRunClient;
  capabilities?: Record<string, ModelFusionCapabilityStatus>;
};

export type CursorHarnessOptions =
  | CursorFixtureHarnessOptions
  | CursorRealHarnessOptions;

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

export type CursorRunClientRequest = {
  cursorRequest: CursorRunRequestV1;
  candidateId: string;
  model: CursorHarnessModel;
  workspacePath: string;
  timeoutMs?: number;
  capabilities: Record<string, ModelFusionCapabilityStatus>;
};

export type CursorRunClientResult = {
  status?: ModelFusionStatus;
  outputSummary?: string;
  transcript?: string;
  rawPayload?: string;
  observedModel?: string;
  modelId?: string;
  endpointId?: string;
  routeInventory?: CursorRouteInventorySummary;
  routeInventoryArtifact?: ArtifactRef;
  artifacts?: CursorArtifactEvidence[];
  capabilities?: Record<string, ModelFusionCapabilityStatus>;
  toolEvidence?: Record<string, JsonValue>[];
};

export type CursorRunClient = {
  capabilities?: () => Record<string, ModelFusionCapabilityStatus>;
  run(input: CursorRunClientRequest): Promise<CursorRunClientResult>;
};

export type CursorBridgeRunClientOptions = {
  bridgeBaseUrl: string;
  authToken?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
};

export type CursorFixtureHarness = {
  id: "cursor";
  adapterMode: "fixture";
  capabilities(): Record<string, ModelFusionCapabilityStatus>;
  runCursorCandidate(input: RunCursorCandidateInput): RunCursorCandidateOutput;
};

export type CursorRealHarness = {
  id: "cursor";
  adapterMode: "real";
  capabilities(): Record<string, ModelFusionCapabilityStatus>;
  runCursorCandidate(
    input: RunCursorCandidateInput,
  ): Promise<RunCursorCandidateOutput>;
};

export type CursorHarness = CursorFixtureHarness | CursorRealHarness;

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
  options: CursorRealHarnessOptions,
): CursorRealHarness;
export function cursorHarness(
  options?: CursorFixtureHarnessOptions,
): CursorFixtureHarness;
export function cursorHarness(
  options: CursorHarnessOptions = {},
): CursorHarness {
  if (options.adapterMode === "real") {
    return {
      id: "cursor",
      adapterMode: "real",
      capabilities: () => realCursorCapabilities(options),
      runCursorCandidate: (input) => runRealCursorCandidate(input, options),
    };
  }
  return {
    id: "cursor",
    adapterMode: "fixture",
    capabilities: () => cursorCapabilities(),
    runCursorCandidate: (input) => runCursorCandidate(input, options),
  };
}

export function runCursorCandidate(
  input: RunCursorCandidateInput,
  options: CursorFixtureHarnessOptions = {},
): RunCursorCandidateOutput {
  const prepared = prepareCursorCandidateRun(
    input,
    options,
    cursorCapabilities(),
  );
  const evidence: CursorCandidateEvidence = {
    ...input.evidence,
    outputSummary:
      input.evidence?.outputSummary ??
      `Cursor candidate ${input.candidateId} recorded fixture-backed smoke evidence.`,
  };
  return buildCursorCandidateOutput({
    input,
    options,
    prepared,
    adapterMode: "fixture",
    evidenceTier: "smoke",
    artifactBaseUri: options.artifactBaseUri ?? "fixture://cursor/smoke",
    evidence,
    status: "succeeded",
  });
}

export async function runRealCursorCandidate(
  input: RunCursorCandidateInput,
  options: CursorRealHarnessOptions,
): Promise<RunCursorCandidateOutput> {
  const prepared = prepareCursorCandidateRun(
    input,
    options,
    realCursorCapabilities(options),
  );
  const cursorRequest = buildCursorRunRequest(input, options, prepared);
  assertCursorRunRequestV1(cursorRequest);
  const clientResult = await options.cursorRunClient.run({
    cursorRequest,
    candidateId: input.candidateId,
    model: input.model,
    workspacePath: cursorRequest.workspace_path,
    timeoutMs: input.timeoutMs,
    capabilities: prepared.capabilities,
  });
  const observedModel =
    clientResult.observedModel ?? input.evidence?.observedModel;
  const evidence: CursorCandidateEvidence = {
    ...input.evidence,
    rawPayload: clientResult.rawPayload ?? input.evidence?.rawPayload,
    transcript: clientResult.transcript ?? input.evidence?.transcript,
    outputSummary:
      clientResult.outputSummary ??
      input.evidence?.outputSummary ??
      `Cursor candidate ${input.candidateId} completed through the real Cursor adapter.`,
    observedModel,
    routeInventory:
      clientResult.routeInventory ?? input.evidence?.routeInventory,
    routeInventoryArtifact:
      clientResult.routeInventoryArtifact ??
      input.evidence?.routeInventoryArtifact,
    artifacts: [
      ...(input.evidence?.artifacts ?? []),
      ...(clientResult.artifacts ?? []),
    ],
    toolEvidence: [
      ...(input.evidence?.toolEvidence ?? []),
      ...(clientResult.toolEvidence ?? []),
    ],
  };
  const modelEvidence = resolveCursorModelEvidence({
    ...input,
    model: {
      ...input.model,
      id: clientResult.modelId ?? input.model.id,
      endpointId: clientResult.endpointId ?? input.model.endpointId,
    },
    evidence,
  });
  return buildCursorCandidateOutput({
    input,
    options,
    prepared: {
      ...prepared,
      cursorRequest,
      capabilities: effectiveCapabilities(
        {
          ...prepared.capabilities,
          ...(clientResult.capabilities ?? {}),
        },
        input.request.requested_capabilities,
      ),
      modelEvidence,
    },
    adapterMode: "real",
    evidenceTier: "real",
    artifactBaseUri:
      options.artifactBaseUri ??
      `cursor-bridge://agent-run/${safeId(input.candidateId)}`,
    evidence,
    status: clientResult.status ?? "succeeded",
  });
}

type PreparedCursorCandidateRun = {
  now: string;
  cursorRunId: string;
  capabilities: Record<string, ModelFusionCapabilityStatus>;
  diagnostics: ModelFusionDiagnostic[];
  missingCapabilities: CursorCapabilityIssue[];
  modelEvidence: CursorModelEvidence;
  cursorRequest?: CursorRunRequestV1;
};

function prepareCursorCandidateRun(
  input: RunCursorCandidateInput,
  options: CursorHarnessBaseOptions,
  actualCapabilities: Record<string, ModelFusionCapabilityStatus>,
): PreparedCursorCandidateRun {
  assertHarnessRunRequestV1(input.request);
  const capabilityPolicy = options.capabilityPolicy ?? "record-and-degrade";
  const capabilities = effectiveCapabilities(
    actualCapabilities,
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

  return {
    now: (options.now ?? (() => new Date()))().toISOString(),
    cursorRunId: `cursor_run_${safeId(input.candidateId)}`,
    capabilities,
    diagnostics,
    missingCapabilities,
    modelEvidence: resolveCursorModelEvidence(input),
  };
}

function buildCursorRunRequest(
  input: RunCursorCandidateInput,
  options: CursorHarnessBaseOptions,
  prepared: PreparedCursorCandidateRun,
): CursorRunRequestV1 {
  return {
    ...metadata("cursor-run-request.v1", options, prepared.now),
    cursor_run_id: prepared.cursorRunId,
    harness_request_id: input.request.request_id,
    workspace_path: input.workspacePath ?? input.worktreePath ?? ".",
    prompt: input.request.prompt,
    prompt_hash: input.request.prompt_hash,
    requested_model: prepared.modelEvidence.requestedModel,
    allowed_tools: input.request.allowed_tools ?? supportedCursorToolNames(),
    side_effects: input.request.side_effects,
    requested_capabilities: input.request.requested_capabilities,
  };
}

function buildCursorCandidateOutput(input: {
  input: RunCursorCandidateInput;
  options: CursorHarnessBaseOptions;
  prepared: PreparedCursorCandidateRun;
  adapterMode: CursorAdapterMode;
  evidenceTier: CursorEvidenceTier;
  artifactBaseUri: string;
  evidence: CursorCandidateEvidence;
  status: ModelFusionStatus;
}): RunCursorCandidateOutput {
  const runInput = input.input;
  const modelEvidence = input.prepared.modelEvidence;
  const cursorRequest =
    input.prepared.cursorRequest ??
    buildCursorRunRequest(runInput, input.options, input.prepared);
  const rawPayload =
    input.evidence.rawPayload ??
    input.evidence.transcript ??
    JSON.stringify({
      prompt: runInput.request.prompt,
      candidateId: runInput.candidateId,
      model: modelEvidence.requestedModel,
      adapterMode: input.adapterMode,
      evidenceTier: input.evidenceTier,
    });
  const sanitized = sanitizeModelFusionPayload({ rawPayload });
  const transcriptArtifact: ArtifactRef = {
    artifact_id: `artifact_${safeId(runInput.candidateId)}_cursor_transcript`,
    kind: "transcript",
    uri: `${input.artifactBaseUri}/${safeId(runInput.candidateId)}-transcript-redacted.json`,
    hash: sanitized.redacted_hash,
    redaction_status:
      input.adapterMode === "fixture" ? "synthetic" : sanitized.redactionStatus,
  };
  const routeInventoryArtifact =
    input.evidence.routeInventoryArtifact ??
    (input.evidence.routeInventory
      ? routeInventoryArtifactFor({
          candidateId: runInput.candidateId,
          artifactBaseUri: input.artifactBaseUri,
          summary: input.evidence.routeInventory,
        })
      : undefined);
  const artifacts = [
    ...artifactRefsForEvidence({
      candidateId: runInput.candidateId,
      artifactBaseUri: input.artifactBaseUri,
      evidence: input.evidence,
    }),
    ...(routeInventoryArtifact ? [routeInventoryArtifact] : []),
  ];

  const cursorResult: CursorRunResultV1 = {
    ...metadata("cursor-run-result.v1", input.options, input.prepared.now),
    cursor_run_id: input.prepared.cursorRunId,
    harness_request_id: runInput.request.request_id,
    mapped_harness_result_id: `harness_result_${safeId(runInput.candidateId)}`,
    status: input.status,
    output_summary:
      input.evidence.outputSummary ??
      `Cursor candidate ${runInput.candidateId} completed.`,
    transcript_artifact: transcriptArtifact,
    ...(artifacts.length > 0 ? { artifacts } : {}),
    capabilities: input.prepared.capabilities,
    requested_model: modelEvidence.requestedModel,
    observed_model: modelEvidence.observedModel,
    model_id: modelEvidence.modelId,
    endpoint_id: modelEvidence.endpointId,
    ...(input.prepared.diagnostics.length > 0
      ? { diagnostics: input.prepared.diagnostics }
      : {}),
    raw_hash: sanitized.raw_hash,
    redacted_hash: sanitized.redacted_hash,
  };

  assertCursorRunRequestV1(cursorRequest);
  assertCursorRunResultV1(cursorResult);
  const mapped = cursorRunResultToHarnessRunResult(cursorResult);
  const toolEvidence = input.evidence.toolEvidence ?? [];
  const harnessResult: HarnessRunResultV1 = {
    ...mapped,
    candidate_ids: [runInput.candidateId],
    metadata: {
      ...(mapped.metadata ?? {}),
      adapter_mode: input.adapterMode,
      evidence_tier: input.evidenceTier,
      fixture: input.adapterMode === "fixture",
      artifact_base_uri: input.artifactBaseUri,
      candidate_id: runInput.candidateId,
      model_id: runInput.model.id,
      model: runInput.model.model,
      endpoint_id: runInput.model.endpointId ?? runInput.model.id,
      requested_model: modelEvidence.requestedModel,
      observed_model: modelEvidence.observedModel,
      model_resolution_status: modelEvidence.status,
      model_resolution_reason: modelEvidence.reason,
      ...(runInput.worktreePath
        ? { worktree_path: runInput.worktreePath }
        : {}),
      missing_capabilities: input.prepared.missingCapabilities,
      route_inventory: input.evidence.routeInventory ?? null,
      ...(routeInventoryArtifact
        ? { route_inventory_evidence: routeInventoryArtifact }
        : {}),
      tool_evidence_count: toolEvidence.length,
      ...(toolEvidence.length > 0 ? { tool_evidence: toolEvidence } : {}),
      ...(runInput.metadata ?? {}),
    },
  };
  assertHarnessRunResultV1(harnessResult);

  return {
    cursorRequest,
    cursorResult,
    harnessResult,
    missingCapabilities: input.prepared.missingCapabilities,
    metadata: harnessResult.metadata ?? {},
  };
}

function artifactRefsForEvidence(input: {
  candidateId: string;
  artifactBaseUri: string;
  evidence: CursorCandidateEvidence;
}): ArtifactRef[] {
  return [
    ...(input.evidence.diff
      ? [
          artifactRefForContent({
            candidateId: input.candidateId,
            artifactBaseUri: input.artifactBaseUri,
            suffix: "cursor_patch",
            filename: `${safeId(input.candidateId)}.patch`,
            kind: "patch",
            content: input.evidence.diff,
          }),
        ]
      : []),
    ...(input.evidence.log
      ? [
          artifactRefForContent({
            candidateId: input.candidateId,
            artifactBaseUri: input.artifactBaseUri,
            suffix: "cursor_log",
            filename: `${safeId(input.candidateId)}.log`,
            kind: "log",
            content: input.evidence.log,
          }),
        ]
      : []),
    ...(input.evidence.artifacts ?? []).map((artifact, index) =>
      artifactRefForEvidence({
        candidateId: input.candidateId,
        artifactBaseUri: input.artifactBaseUri,
        artifact,
        index,
      }),
    ),
  ];
}

function artifactRefForContent(input: {
  candidateId: string;
  artifactBaseUri: string;
  suffix: string;
  filename: string;
  kind: ArtifactRef["kind"];
  content: string;
}): ArtifactRef {
  return {
    artifact_id: `artifact_${safeId(input.candidateId)}_${input.suffix}`,
    kind: input.kind,
    uri: `${input.artifactBaseUri}/${input.filename}`,
    hash: sha256Prefixed(input.content),
    redaction_status: "redacted",
  };
}

function artifactRefForEvidence(input: {
  candidateId: string;
  artifactBaseUri: string;
  artifact: CursorArtifactEvidence;
  index: number;
}): ArtifactRef {
  const suffix = `${input.artifact.kind}_${String(input.index + 1)}`;
  const artifactId =
    input.artifact.artifactId ??
    `artifact_${safeId(input.candidateId)}_cursor_${suffix}`;
  const uri =
    input.artifact.uri ??
    `${input.artifactBaseUri}/${safeId(input.candidateId)}-${suffix}.json`;
  return {
    artifact_id: artifactId,
    kind: input.artifact.kind,
    uri,
    hash:
      input.artifact.hash ??
      sha256Prefixed(input.artifact.content ?? `${artifactId}:${uri}`),
    redaction_status: input.artifact.redactionStatus ?? "redacted",
  };
}

function realCursorCapabilities(
  options: CursorRealHarnessOptions,
): Record<string, ModelFusionCapabilityStatus> {
  return {
    ...cursorCapabilities(),
    ...(options.cursorRunClient.capabilities?.() ?? {}),
    ...(options.capabilities ?? {}),
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

export function createCursorBridgeRunClient(
  options: CursorBridgeRunClientOptions,
): CursorRunClient {
  return {
    capabilities: () => ({
      workspace_read: "supported",
      route_observation: "degraded",
      apply_patch: "unsupported",
      tool_call_loop: "unsupported",
    }),
    run: async (input) => {
      const response = await postAgentRunToBridge(options, input);
      const body = Buffer.from(await response.arrayBuffer());
      const transcript = decodeAgentRunTranscript(body);
      const routeInventory: CursorRouteInventorySummary = {
        observedRoutes: 1,
        passThroughRoutes: 0,
        interceptedRoutes: response.ok ? 1 : 0,
        degradedRoutes: response.ok ? 0 : 1,
        failedRouteCount: response.ok ? 0 : 1,
        observedPaths: [AGENT_RUN_PATH],
        diagnosis: [
          response.ok
            ? "Agent Run was submitted through the Cursor bridge route."
            : `Agent Run bridge request failed with HTTP ${String(response.status)}.`,
        ],
      };
      const rawPayload = stableJson({
        schema: "cursor-agent-run-transcript.v1",
        bridge_path: AGENT_RUN_PATH,
        status: response.status,
        headers: responseHeaders(response),
        transcript,
      });
      return {
        status: response.ok ? "succeeded" : "failed",
        outputSummary:
          transcript.text.length > 0
            ? transcript.text
            : `Cursor bridge Agent Run returned HTTP ${String(response.status)}.`,
        transcript: rawPayload,
        rawPayload,
        observedModel: input.model.model,
        routeInventory,
        artifacts: [
          {
            kind: "log",
            content: stableJson({
              bridge_path: AGENT_RUN_PATH,
              status: response.status,
              body_bytes: body.byteLength,
              text_chars: transcript.text.length,
            }),
          },
        ],
        toolEvidence: [
          {
            bridge_path: AGENT_RUN_PATH,
            observed_tool_events: transcript.toolEventCount,
          },
        ],
      };
    },
  };
}

async function postAgentRunToBridge(
  options: CursorBridgeRunClientOptions,
  input: CursorRunClientRequest,
): Promise<Response> {
  const fetchImpl = options.fetch ?? fetch;
  const controller = new AbortController();
  let timeout: NodeJS.Timeout | undefined;
  if (input.timeoutMs !== undefined) {
    timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  }
  try {
    return await fetchImpl(agentRunUrl(options.bridgeBaseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/connect+proto",
        ...(options.authToken !== undefined
          ? { authorization: `Bearer ${options.authToken}` }
          : {}),
        ...(options.headers ?? {}),
      },
      body: new Uint8Array(
        encodeEnvelope(
          toBinary(
            AgentClientMessageSchema,
            create(AgentClientMessageSchema, {
              runRequest: create(AgentRunRequestSchema, {
                requestedModel: create(RequestedModelSchema, {
                  modelId:
                    input.cursorRequest.requested_model ?? input.model.model,
                }),
                action: create(ConversationActionSchema, {
                  userMessageAction: create(UserMessageActionSchema, {
                    userMessage: create(UserMessageSchema, {
                      text: input.cursorRequest.prompt,
                    }),
                  }),
                }),
              }),
            }),
          ),
        ),
      ),
      signal: controller.signal,
    });
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

function agentRunUrl(bridgeBaseUrl: string): string {
  return new URL(AGENT_RUN_PATH, bridgeBaseUrl).toString();
}

function decodeAgentRunTranscript(body: Buffer): {
  text: string;
  messageCount: number;
  toolEventCount: number;
} {
  const textParts: string[] = [];
  let messageCount = 0;
  let toolEventCount = 0;
  try {
    for (const envelope of decodeEnvelopes(body)) {
      if (isEndStreamEnvelope(envelope) || envelope.payload.length === 0) {
        continue;
      }
      const message = fromBinary(AgentServerMessageSchema, envelope.payload);
      messageCount += 1;
      const delta = message.interactionUpdate?.textDelta?.text;
      if (delta !== undefined && delta.length > 0) {
        textParts.push(delta);
      }
      if (message.execServerMessage !== undefined) {
        toolEventCount += 1;
      }
    }
  } catch (error) {
    textParts.push(
      `Agent Run response decode failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return {
    text: textParts.join(""),
    messageCount,
    toolEventCount,
  };
}

function responseHeaders(response: Response): Record<string, JsonValue> {
  const headers: Record<string, JsonValue> = {};
  response.headers.forEach((value, key) => {
    if (/authorization|cookie|token|key|secret/i.test(key)) {
      headers[key] = "[REDACTED]";
      return;
    }
    headers[key] = value.slice(0, 1_000);
  });
  return headers;
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
