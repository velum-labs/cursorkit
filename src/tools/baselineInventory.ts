import fs from "node:fs";
import path from "node:path";

import { format } from "prettier";

import { ROUTE_CONTRACT_SEEDS, type RoutePolicy } from "../routes.js";

interface ServiceMethod {
  packageName: string;
  service: string;
  method: string;
  inputType: string;
  outputType: string;
  serverStreaming: boolean;
}

interface RouteContractEntry {
  path: string;
  policy: RoutePolicy;
  owner: string;
  packageName?: string;
  service?: string;
  method?: string;
  inputType?: string;
  outputType?: string;
  serverStreaming?: boolean;
  protoBacked: boolean;
  supportLevel: string;
  expectedMethods: string[];
  expectedContentTypes: string[];
  fixtureStatus: string;
  testStatus: string;
  realClientEvidence: string;
  reason: string;
  uncertainty: string;
}

interface ConfigEnvEntry {
  name: string;
  category: string;
  defaultValue: string;
  requiredWhen?: string;
  description: string;
}

interface UnknownRouteEntry {
  path: string;
  packageName?: string;
  service?: string;
  method?: string;
  inputType?: string;
  outputType?: string;
  serverStreaming?: boolean;
  policy: "pass-through";
  supportLevel: "observe-first" | "unsupported";
  uncertainty: string;
}

interface TestManifestSuite {
  id: string;
  command?: string;
  deterministic: boolean;
  status: "implemented" | "not_implemented" | "optional_live";
  categories: string[];
  releaseCheck:
    | "required"
    | "reported_skipped_with_reason"
    | "outside_release_check";
  prerequisites: string[];
  timeoutMs: number;
  artifactOutputs: string[];
  completionCriteria: string[];
}

interface BaselineArtifacts {
  routeContractManifest: unknown;
  routePolicy: unknown;
  implementationInventory: unknown;
  testManifest: unknown;
  releaseSummary: unknown;
}

const ROUTE_CONTRACT_MANIFEST_PATH = "docs/route-contract-manifest.json";
const ROUTE_POLICY_PATH = "docs/route-policy.json";
const IMPLEMENTATION_INVENTORY_PATH = "docs/implementation-inventory.json";
const TEST_MANIFEST_PATH = "docs/test-manifest.json";
const RELEASE_SUMMARY_PATH = "docs/release-summary.json";

export const BASELINE_ARTIFACT_PATHS = [
  ROUTE_CONTRACT_MANIFEST_PATH,
  ROUTE_POLICY_PATH,
  IMPLEMENTATION_INVENTORY_PATH,
  TEST_MANIFEST_PATH,
  RELEASE_SUMMARY_PATH,
] as const;

const CONFIG_ENV_ANNOTATIONS: Record<string, Omit<ConfigEnvEntry, "name">> = {
  BRIDGE_AGENT_PUBLIC_ORIGIN: {
    category: "desktop",
    defaultValue: "undefined",
    description:
      "Public origin advertised to Cursor Agent clients when different from the bridge public origin.",
  },
  BRIDGE_AGENT_CONTEXT_TIMEOUT_MS: {
    category: "reliability",
    defaultValue: "undefined",
    description:
      "Optional timeout for gathering agent context before local model execution.",
  },
  BRIDGE_AGENT_NATIVE_CONTEXT: {
    category: "agent-tools",
    defaultValue: "true",
    description:
      "Controls whether local agent runs include native Cursor context gathered before model execution.",
  },
  BRIDGE_AGENT_RUN_SSE_WAIT_TIMEOUT_MS: {
    category: "reliability",
    defaultValue: "undefined",
    description:
      "Optional timeout for waiting on pending Agent RunSSE/Bidi state.",
  },
  BRIDGE_AGENT_TOOL_POLICY: {
    category: "agent-tools",
    defaultValue: "safe",
    description:
      "Controls whether local agent runs advertise only safe tools or the approved extended tool set.",
  },
  BRIDGE_AGENT_TOOL_MAX_ITERATIONS: {
    category: "agent-tools",
    defaultValue: "8",
    description:
      "Maximum number of tool-call iterations the bridge runs per local agent turn before stopping.",
  },
  BRIDGE_AGENT_TOOL_RESULT_TIMEOUT_MS: {
    category: "reliability",
    defaultValue: "undefined",
    description:
      "Optional timeout for waiting on Cursor exec tool results during local agent runs.",
  },
  BRIDGE_AUTH_TOKEN: {
    category: "safety",
    defaultValue: "undefined",
    requiredWhen:
      "BRIDGE_HOST is non-localhost unless BRIDGE_UNSAFE_ALLOW_NON_LOCALHOST=true",
    description:
      "Bearer token required to protect non-localhost bridge binds unless explicitly bypassed.",
  },
  BRIDGE_CAPTURE_DIR: {
    category: "capture",
    defaultValue: "fixtures/captures",
    description: "Directory for traffic captures when capture mode is enabled.",
  },
  BRIDGE_CAPTURE_ENABLED: {
    category: "capture",
    defaultValue: "false",
    description:
      "Enables explicit traffic capture hooks; route inventory is separate.",
  },
  BRIDGE_CERT_PATH: {
    category: "tls",
    defaultValue: "undefined",
    requiredWhen: "BRIDGE_USE_TLS=true and generated certs are not used",
    description: "Path to TLS certificate material.",
  },
  BRIDGE_DESKTOP_AGENT_HTTP_PORT: {
    category: "desktop",
    defaultValue: "undefined",
    description:
      "Optional secondary HTTP listener port for desktop agent compatibility experiments.",
  },
  BRIDGE_DESKTOP_MODE: {
    category: "desktop",
    defaultValue: "false",
    description:
      "Enables desktop proxy defaults, including upstream, public origin, TLS hostnames, and route inventory.",
  },
  BRIDGE_EXTENSION_SETUP_TIMEOUT_MS: {
    category: "reliability",
    defaultValue: "undefined",
    description:
      "Optional timeout for local extension/plugin setup during bridge startup.",
  },
  BRIDGE_FAIL_OPEN: {
    category: "safety",
    defaultValue: "true",
    description:
      "Controls whether typed intercept failures return explicit bridge errors after consuming request bodies.",
  },
  BRIDGE_HARDCODED_RESPONSE: {
    category: "model",
    defaultValue: "undefined",
    description:
      "Optional fixed local model response for deterministic experiments.",
  },
  BRIDGE_HOST: {
    category: "core",
    defaultValue: "127.0.0.1",
    description: "Bridge bind host.",
  },
  BRIDGE_KEY_PATH: {
    category: "tls",
    defaultValue: "undefined",
    requiredWhen: "BRIDGE_USE_TLS=true and generated certs are not used",
    description: "Path to TLS private key material.",
  },
  BRIDGE_LOG_LEVEL: {
    category: "diagnostics",
    defaultValue: "info",
    description: "Bridge log level: debug, info, warn, or error.",
  },
  BRIDGE_LOG_MODEL_PAYLOADS: {
    category: "diagnostics",
    defaultValue: "summary",
    description:
      "Controls local model payload logging; full payload logging is explicit opt-in.",
  },
  BRIDGE_MAX_INTERCEPT_BODY_BYTES: {
    category: "safety",
    defaultValue: "52428800",
    description: "Maximum buffered body size for typed intercept routes.",
  },
  BRIDGE_MODELS_JSON: {
    category: "model",
    defaultValue: "undefined",
    description:
      "JSON array of local model registrations with Cursor-facing and provider-facing IDs.",
  },
  BRIDGE_PLUGIN_PATH: {
    category: "plugins",
    defaultValue: "undefined",
    description: "Experimental local plugin module path.",
  },
  BRIDGE_PORT: {
    category: "core",
    defaultValue: "9443",
    description: "Bridge bind port.",
  },
  BRIDGE_PUBLIC_ORIGIN: {
    category: "desktop",
    defaultValue: "desktop mode: https://api2.cursor.sh; otherwise undefined",
    description:
      "Public origin advertised in rewritten server config responses.",
  },
  BRIDGE_ROUTE_INVENTORY: {
    category: "diagnostics",
    defaultValue: "desktop mode: true; otherwise false",
    description:
      "Enables redacted method/path/content-type/status/framing route inventory logs.",
  },
  BRIDGE_TLS_HOSTNAMES: {
    category: "tls",
    defaultValue:
      "desktop mode: api2.cursor.sh,api3.cursor.sh,agent.api5.cursor.sh,agentn.api5.cursor.sh,agentn.global.api5.cursor.sh,localhost,127.0.0.1,::1; otherwise localhost,127.0.0.1,::1",
    description:
      "Comma-separated hostnames/IPs for generated TLS certificate SANs.",
  },
  BRIDGE_UNSAFE_ALLOW_NON_LOCALHOST: {
    category: "safety",
    defaultValue: "false",
    description:
      "Required override before binding the bridge to anything other than localhost.",
  },
  BRIDGE_USE_TLS: {
    category: "tls",
    defaultValue: "false",
    description: "Runs the bridge over HTTPS when enabled.",
  },
  BRIDGE_UPSTREAM_REQUEST_TIMEOUT_MS: {
    category: "reliability",
    defaultValue: "undefined",
    description:
      "Optional timeout for pass-through requests to Cursor upstream services.",
  },
  CURSOR_UPSTREAM_BASE_URL: {
    category: "upstream",
    defaultValue: "desktop mode: https://api2.cursor.sh; otherwise undefined",
    description: "Logical Cursor upstream base URL for pass-through traffic.",
  },
  CURSOR_UPSTREAM_CONNECT_HOST: {
    category: "upstream",
    defaultValue: "undefined",
    description:
      "Optional physical upstream host/IP while preserving logical Host and TLS SNI.",
  },
  CURSOR_UPSTREAM_CONNECT_PORT: {
    category: "upstream",
    defaultValue: "undefined",
    description:
      "Optional physical upstream port paired with CURSOR_UPSTREAM_CONNECT_HOST.",
  },
  MODEL_API_KEY: {
    category: "model",
    defaultValue: "",
    description: "API key sent to the OpenAI-compatible local model backend.",
  },
  MODEL_BASE_URL: {
    category: "model",
    defaultValue: "http://localhost:8080/v1",
    description: "OpenAI-compatible local model endpoint.",
  },
  MODEL_CONTEXT_TOKEN_LIMIT: {
    category: "model",
    defaultValue: "128000",
    description: "Advertised local model context window.",
  },
  MODEL_REQUEST_TIMEOUT_MS: {
    category: "model",
    defaultValue: "undefined",
    description:
      "Optional request deadline for OpenAI-compatible local model backend calls.",
  },
  MODEL_NAME: {
    category: "model",
    defaultValue: "local-model",
    description: "Default Cursor-facing local model ID.",
  },
  MODEL_PROVIDER_MODEL: {
    category: "model",
    defaultValue: "MODEL_NAME",
    description:
      "Provider-facing model ID sent to the local backend when different from MODEL_NAME.",
  },
};

export async function writeBaselineArtifacts(
  repoRoot = process.cwd(),
): Promise<void> {
  const rendered = await renderBaselineArtifacts(repoRoot);
  for (const [relativePath, contents] of Object.entries(rendered)) {
    const absolutePath = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, contents);
  }
}

export async function checkBaselineArtifacts(
  repoRoot = process.cwd(),
): Promise<string[]> {
  const rendered = await renderBaselineArtifacts(repoRoot);
  const changed: string[] = [];
  for (const [relativePath, expected] of Object.entries(rendered)) {
    const absolutePath = path.join(repoRoot, relativePath);
    const actual = fs.existsSync(absolutePath)
      ? fs.readFileSync(absolutePath, "utf8")
      : "";
    if (actual !== expected) {
      changed.push(relativePath);
    }
  }
  return changed;
}

export function buildBaselineArtifacts(
  repoRoot = process.cwd(),
): BaselineArtifacts {
  const serviceManifest = readServiceManifest(repoRoot);
  const routeContracts = buildRouteContracts(serviceManifest);
  const configInventory = buildConfigInventory(repoRoot);
  const unknownRoutes = buildUnknownRoutes(serviceManifest);
  const testManifest = buildTestManifest();
  const releaseSummary = buildReleaseSummary(
    routeContracts,
    configInventory,
    unknownRoutes,
    testManifest,
  );

  return {
    routeContractManifest: {
      schemaVersion: 1,
      generatedBy: "src/tools/baselineInventory.ts",
      sources: ["docs/service-manifest.json", "src/routes.ts", "src/config.ts"],
      routes: routeContracts,
    },
    routePolicy: [
      ...routeContracts.map((route) => ({
        path: route.path,
        package: route.packageName,
        service: route.service,
        method: route.method,
        policy: route.policy,
        supportLevel: route.supportLevel,
        reason: route.reason,
        uncertainty: route.uncertainty,
      })),
      {
        path: "*",
        policy: "pass-through",
        supportLevel: "observe-first",
        reason:
          "Default byte-preserving proxy policy for unknown or unverified routes.",
        uncertainty:
          "Desktop-specific and proto-visible routes must be observed and decoded before interception.",
      },
    ],
    implementationInventory: {
      schemaVersion: 1,
      generatedBy: "src/tools/baselineInventory.ts",
      sources: ["docs/service-manifest.json", "src/routes.ts", "src/config.ts"],
      routes: routeContracts,
      config: {
        envVars: configInventory,
      },
      uncertaintyRegister: unknownRoutes,
    },
    testManifest: {
      schemaVersion: 1,
      generatedBy: "src/tools/baselineInventory.ts",
      suites: testManifest,
    },
    releaseSummary,
  };
}

async function renderBaselineArtifacts(
  repoRoot: string,
): Promise<Record<string, string>> {
  const artifacts = buildBaselineArtifacts(repoRoot);
  return {
    [ROUTE_CONTRACT_MANIFEST_PATH]: await renderJson(
      artifacts.routeContractManifest,
    ),
    [ROUTE_POLICY_PATH]: await renderJson(artifacts.routePolicy),
    [IMPLEMENTATION_INVENTORY_PATH]: await renderJson(
      artifacts.implementationInventory,
    ),
    [TEST_MANIFEST_PATH]: await renderJson(artifacts.testManifest),
    [RELEASE_SUMMARY_PATH]: await renderJson(artifacts.releaseSummary),
  };
}

function readServiceManifest(repoRoot: string): ServiceMethod[] {
  const manifestPath = path.join(repoRoot, "docs/service-manifest.json");
  const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("docs/service-manifest.json must contain an array");
  }
  return parsed.map((entry, index) => {
    if (!isServiceMethod(entry)) {
      throw new Error(`Invalid service manifest entry at index ${index}`);
    }
    return entry;
  });
}

function buildRouteContracts(
  serviceManifest: ServiceMethod[],
): RouteContractEntry[] {
  return ROUTE_CONTRACT_SEEDS.map((seed) => {
    const protoMethod =
      seed.packageName === undefined ||
      seed.service === undefined ||
      seed.method === undefined
        ? undefined
        : findServiceMethod(serviceManifest, {
            packageName: seed.packageName,
            service: seed.service,
            method: seed.method,
          });
    if (
      seed.packageName !== undefined &&
      seed.service !== undefined &&
      seed.method !== undefined &&
      protoMethod === undefined
    ) {
      throw new Error(
        `Route ${seed.path} references missing proto method ${seed.packageName}.${seed.service}/${seed.method}`,
      );
    }

    return {
      path: seed.path,
      policy: seed.policy,
      owner: seed.owner,
      packageName: seed.packageName,
      service: seed.service,
      method: seed.method,
      inputType: protoMethod?.inputType,
      outputType: protoMethod?.outputType,
      serverStreaming: protoMethod?.serverStreaming,
      protoBacked: protoMethod !== undefined,
      supportLevel: seed.supportLevel,
      expectedMethods: [...seed.expectedMethods],
      expectedContentTypes: [...seed.expectedContentTypes],
      fixtureStatus:
        seed.supportLevel === "implemented"
          ? "synthetic-or-unit-covered"
          : "needs-captured-fixture",
      testStatus:
        seed.supportLevel === "implemented"
          ? "focused-tests-present"
          : "partial-tests-present",
      realClientEvidence:
        seed.supportLevel === "implemented"
          ? "cli-or-unit-evidence"
          : "traffic-gated",
      reason: seed.reason,
      uncertainty: seed.uncertainty,
    };
  });
}

function buildConfigInventory(repoRoot: string): ConfigEnvEntry[] {
  const configPath = path.join(repoRoot, "src/config.ts");
  const configSource = fs.readFileSync(configPath, "utf8");
  const names = Array.from(
    new Set(
      Array.from(configSource.matchAll(/\benv\.([A-Z][A-Z0-9_]*)\b/g)).map(
        (match) => match[1] ?? "",
      ),
    ),
  ).filter((name) => name.length > 0);
  return names.sort().map((name) => {
    const annotation = CONFIG_ENV_ANNOTATIONS[name];
    if (annotation === undefined) {
      throw new Error(`Missing config inventory annotation for ${name}`);
    }
    return { name, ...annotation };
  });
}

function buildUnknownRoutes(
  serviceManifest: ServiceMethod[],
): UnknownRouteEntry[] {
  const protoUnknowns = [
    {
      packageName: "agent.v1",
      service: "AgentService",
      method: "RunPoll",
      uncertainty:
        "Proto-visible alternate Agent transport; leave pass-through until real traffic proves request-id and poll framing.",
    },
    {
      packageName: "aiserver.v1",
      service: "ChatService",
      method: "StreamUnifiedChatWithToolsSSE",
      uncertainty:
        "Proto-visible Chat SSE variant; leave pass-through until content type, request-id flow, and response shape are captured.",
    },
    {
      packageName: "aiserver.v1",
      service: "ChatService",
      method: "StreamUnifiedChatWithToolsPoll",
      uncertainty:
        "Proto-visible Chat poll variant; leave pass-through until BidiPollRequest/BidiPollResponse framing is captured.",
    },
    {
      packageName: "aiserver.v1",
      service: "ChatService",
      method: "StreamUnifiedChatWithToolsIdempotent",
      uncertainty:
        "Proto-visible idempotent Chat route; leave pass-through until observed traffic proves it is needed.",
    },
    {
      packageName: "aiserver.v1",
      service: "ChatService",
      method: "StreamUnifiedChatWithToolsIdempotentSSE",
      uncertainty:
        "Proto-visible idempotent Chat SSE route; leave pass-through until observed and decoded.",
    },
    {
      packageName: "aiserver.v1",
      service: "ChatService",
      method: "StreamUnifiedChatWithToolsIdempotentPoll",
      uncertainty:
        "Proto-visible idempotent Chat poll route; leave pass-through until observed and decoded.",
    },
  ];

  return [
    ...protoUnknowns.map((unknown) => {
      const method = findServiceMethod(serviceManifest, unknown);
      if (method === undefined) {
        throw new Error(
          `Unknown-route inventory references missing proto method ${unknown.packageName}.${unknown.service}/${unknown.method}`,
        );
      }
      return {
        path: `/${unknown.packageName}.${unknown.service}/${unknown.method}`,
        packageName: unknown.packageName,
        service: unknown.service,
        method: unknown.method,
        inputType: method.inputType,
        outputType: method.outputType,
        serverStreaming: method.serverStreaming,
        policy: "pass-through" as const,
        supportLevel: "observe-first" as const,
        uncertainty: unknown.uncertainty,
      };
    }),
    {
      path: "desktop-route-set",
      policy: "pass-through",
      supportLevel: "observe-first",
      uncertainty:
        "Cursor desktop route set remains uncertain; use redacted route inventory before adding desktop-only interceptors.",
    },
  ];
}

function buildTestManifest(): TestManifestSuite[] {
  return [
    {
      id: "baseline-drift",
      command: "pnpm baseline:check",
      deterministic: true,
      status: "implemented",
      categories: ["baseline-drift", "protocol", "final-gate"],
      releaseCheck: "required",
      prerequisites: ["node>=22", "pnpm install"],
      timeoutMs: 30_000,
      artifactOutputs: [
        ROUTE_CONTRACT_MANIFEST_PATH,
        IMPLEMENTATION_INVENTORY_PATH,
        TEST_MANIFEST_PATH,
        RELEASE_SUMMARY_PATH,
      ],
      completionCriteria: [
        "Generated route/config/docs artifacts match committed files.",
        "Every route in src/routes.ts has a route contract entry.",
        "Every env var read by src/config.ts has a config inventory entry.",
      ],
    },
    {
      id: "build",
      command: "pnpm build",
      deterministic: true,
      status: "implemented",
      categories: ["static", "final-gate"],
      prerequisites: ["node>=22", "pnpm install"],
      releaseCheck: "required",
      timeoutMs: 60_000,
      artifactOutputs: [".cursor-rpc/release-check/release-summary.json"],
      completionCriteria: ["TypeScript build and declaration emit pass."],
    },
    {
      id: "unit-tests",
      command: "pnpm test",
      deterministic: true,
      status: "implemented",
      categories: [
        "protocol",
        "mlx",
        "tool",
        "reliability-security",
        "final-gate",
      ],
      releaseCheck: "required",
      prerequisites: ["node>=22", "pnpm install"],
      timeoutMs: 120_000,
      artifactOutputs: [".cursor-rpc/release-check/release-summary.json"],
      completionCriteria: [
        "Protocol route shapes, fixture replay, MLX contract, tool runtime, desktop proxy, and reliability/security regression tests pass.",
      ],
    },
    {
      id: "format-check",
      command: "pnpm format:check",
      deterministic: true,
      status: "implemented",
      categories: ["static", "final-gate"],
      releaseCheck: "required",
      prerequisites: ["node>=22", "pnpm install"],
      timeoutMs: 60_000,
      artifactOutputs: [".cursor-rpc/release-check/release-summary.json"],
      completionCriteria: [
        "Source, tests, docs, JSON, YAML, and examples formatting pass.",
      ],
    },
    {
      id: "examples-typecheck",
      command: "pnpm examples:check",
      deterministic: true,
      status: "implemented",
      categories: ["packaging", "final-gate"],
      releaseCheck: "required",
      prerequisites: ["node>=22", "pnpm install", "pnpm build"],
      timeoutMs: 60_000,
      artifactOutputs: [".cursor-rpc/release-check/release-summary.json"],
      completionCriteria: [
        "Examples typecheck against the built package exports that tarball consumers use.",
      ],
    },
    {
      id: "pack-smoke",
      command: "pnpm pack && pnpm add --offline <tarball> && cursorkit --help",
      deterministic: true,
      status: "implemented",
      categories: ["packaging", "final-gate"],
      releaseCheck: "required",
      prerequisites: ["node>=22", "pnpm install", "pnpm build"],
      timeoutMs: 60_000,
      artifactOutputs: [".cursor-rpc/release-check/release-summary.json"],
      completionCriteria: [
        "Packed tarball contains required dist/src, proto, docs, README.md, and DISCLAIMER.md files.",
        "Source examples are typechecked but intentionally excluded from the tarball.",
        "A clean temporary project can install the tarball from the local pnpm store.",
        "The packed cursorkit binary executes --help successfully.",
      ],
    },
    {
      id: "mlx-live",
      command:
        "pnpm test:harness -- --suite local-backend --base-url <mlx-url> --provider-model <mlx-model>",
      deterministic: false,
      status: "optional_live",
      categories: ["mlx"],
      releaseCheck: "reported_skipped_with_reason",
      prerequisites: ["Running MLX OpenAI-compatible backend"],
      timeoutMs: 30_000,
      artifactOutputs: [".cursor-rpc/test-runs/*/local-backend-report.json"],
      completionCriteria: [
        "/v1/models returns the configured provider model.",
        "/v1/chat/completions returns a non-empty response.",
      ],
    },
    {
      id: "real-client-live",
      command:
        "pnpm test:harness -- --suite traffic,acp --base-url <mlx-url> --model <cursor-model> --provider-model <mlx-model>",
      deterministic: false,
      status: "optional_live",
      categories: ["protocol", "mlx", "tool"],
      releaseCheck: "reported_skipped_with_reason",
      prerequisites: [
        "cursor-agent installed",
        "Cursor auth available",
        "Running MLX OpenAI-compatible backend",
      ],
      timeoutMs: 120_000,
      artifactOutputs: [".cursor-rpc/test-runs/*/summary.json"],
      completionCriteria: [
        "CLI, ACP, and desktop flows report passed or skipped_with_reason.",
      ],
    },
    {
      id: "desktop-live",
      command:
        "pnpm test:harness -- --suite desktop-ui-experimental --include-experimental --base-url <mlx-url> --model <cursor-model> --provider-model <mlx-model>",
      deterministic: false,
      status: "optional_live",
      categories: ["desktop-optional-live"],
      releaseCheck: "reported_skipped_with_reason",
      prerequisites: [
        "Cursor desktop installed",
        "Cursor auth available",
        "Running MLX OpenAI-compatible backend",
      ],
      timeoutMs: 180_000,
      artifactOutputs: [".cursor-rpc/test-runs/*/desktop-ui-report.json"],
      completionCriteria: [
        "Desktop route inventory, picker visibility, selected local model, submitted prompt, MLX request, and visible response pass or report skipped_with_reason with an actionable prerequisite.",
      ],
    },
  ];
}

function buildReleaseSummary(
  routes: RouteContractEntry[],
  configInventory: ConfigEnvEntry[],
  uncertaintyRegister: UnknownRouteEntry[],
  testManifest: TestManifestSuite[],
): unknown {
  const interceptRoutes = routes.filter(
    (route) => route.policy === "intercept",
  );
  const protoBackedRoutes = routes.filter((route) => route.protoBacked);
  return {
    schemaVersion: 1,
    generatedBy: "src/tools/baselineInventory.ts",
    phase: "baseline-drift",
    status: "ci-release-scaffolded",
    deterministicGate: "pnpm release:check",
    categories: buildReleaseSummaryCategories(testManifest),
    metrics: {
      routeContractCoverage: `${routes.length}/${ROUTE_CONTRACT_SEEDS.length}`,
      interceptRouteCount: interceptRoutes.length,
      protoBackedRouteCount: protoBackedRoutes.length,
      configEnvVarCount: configInventory.length,
      uncertaintyCount: uncertaintyRegister.length,
      implementedDeterministicSuites: testManifest.filter(
        (suite) => suite.deterministic && suite.status === "implemented",
      ).length,
      placeholderSuites: testManifest.filter(
        (suite) => suite.status === "not_implemented",
      ).length,
      optionalLiveSuites: testManifest.filter(
        (suite) => suite.status === "optional_live",
      ).length,
    },
    remainingBlockers: [
      "Captured fixture replay for conditional intercept routes.",
      "Live cursor-agent, ACP, and desktop acceptance gates.",
      "Final reliability/security hardening validation.",
      "Final full-gate run with optional live MLX and desktop prerequisites available.",
    ],
  };
}

function buildReleaseSummaryCategories(
  testManifest: TestManifestSuite[],
): Array<{
  id: string;
  deterministicSuites: string[];
  optionalLiveSuites: string[];
  releaseCheckStatus: string;
}> {
  const categoryIds = [
    "baseline-drift",
    "static",
    "protocol",
    "mlx",
    "tool",
    "desktop-optional-live",
    "reliability-security",
    "packaging",
    "final-gate",
  ];
  return categoryIds.map((category) => {
    const suites = testManifest.filter((suite) =>
      suite.categories.includes(category),
    );
    const deterministicSuites = suites
      .filter((suite) => suite.deterministic)
      .map((suite) => suite.id);
    const optionalLiveSuites = suites
      .filter((suite) => !suite.deterministic)
      .map((suite) => suite.id);
    return {
      id: category,
      deterministicSuites,
      optionalLiveSuites,
      releaseCheckStatus:
        deterministicSuites.length > 0
          ? "required"
          : "skipped_with_reason_until_prerequisites_available",
    };
  });
}

function findServiceMethod(
  serviceManifest: ServiceMethod[],
  key: { packageName: string; service: string; method: string },
): ServiceMethod | undefined {
  return serviceManifest.find(
    (entry) =>
      entry.packageName === key.packageName &&
      entry.service === key.service &&
      entry.method === key.method,
  );
}

async function renderJson(value: unknown): Promise<string> {
  return format(`${JSON.stringify(value, null, 2)}\n`, { parser: "json" });
}

function isServiceMethod(value: unknown): value is ServiceMethod {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.packageName === "string" &&
    typeof entry.service === "string" &&
    typeof entry.method === "string" &&
    typeof entry.inputType === "string" &&
    typeof entry.outputType === "string" &&
    typeof entry.serverStreaming === "boolean"
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--check")) {
    const changed = await checkBaselineArtifacts();
    if (changed.length > 0) {
      console.error(
        `Baseline artifacts are out of date. Run pnpm baseline:generate.\nChanged files:\n${changed
          .map((file) => `- ${file}`)
          .join("\n")}`,
      );
      process.exitCode = 1;
    }
  } else {
    await writeBaselineArtifacts();
  }
}
