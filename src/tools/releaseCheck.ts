import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type GateStatus = "passed" | "failed" | "skipped_with_reason";

export type ReleaseCategoryId =
  | "baseline-drift"
  | "static"
  | "protocol"
  | "mlx"
  | "tool"
  | "desktop-optional-live"
  | "reliability-security"
  | "packaging"
  | "final-gate";

interface CommandGate {
  id: string;
  description: string;
  command: string;
  args: string[];
  deterministic: boolean;
  categories: ReleaseCategoryId[];
}

interface PackageSmokeGate {
  id: "package-smoke";
  description: string;
  deterministic: true;
  categories: ReleaseCategoryId[];
  run(repoRoot: string): GateExecution;
}

type Gate = CommandGate | PackageSmokeGate;

interface GateExecution {
  status: "passed" | "failed";
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  details: Record<string, unknown>;
}

type GateResult = Gate & {
  commandLine: string;
  status: GateStatus;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  reason?: string;
  details?: Record<string, unknown>;
};

export interface ReleaseGateStatusInput {
  id: string;
  status: GateStatus;
  categories: ReleaseCategoryId[];
}

export interface OptionalLiveSuite {
  id: string;
  category: ReleaseCategoryId;
  status: "skipped_with_reason";
  reason: string;
  command: string;
  prerequisites: string[];
}

export interface ReleaseCategoryStatus {
  id: ReleaseCategoryId;
  status: GateStatus;
  gateIds: string[];
  optionalSuiteIds: string[];
  summary: string;
}

const RELEASE_CHECK_DIR = ".cursor-rpc/release-check";
const PACKAGE_SMOKE_COMMAND =
  "pnpm pack, pnpm add --offline <tarball>, cursorkit --help";

export const REQUIRED_PACKAGE_ENTRIES = [
  "package/package.json",
  "package/README.md",
  "package/DISCLAIMER.md",
  "package/LICENSE",
  "package/dist/src/cli.js",
  "package/dist/src/cli.d.ts",
  "package/proto/agent/v1/agent.proto",
  "package/proto/aiserver/v1/aiserver.proto",
  "package/docs/protocol.md",
  "package/docs/release-gates.md",
  "package/docs/testing-harness.md",
  "package/docs/test-manifest.json",
  "package/docs/route-contract-manifest.json",
  "package/docs/release-summary.json",
] as const;

export const EXCLUDED_PACKAGE_ENTRY_PREFIXES = ["package/examples/"] as const;

const GATES: Gate[] = [
  {
    id: "baseline-drift",
    description: "Generated route/config/docs inventory drift check.",
    command: "pnpm",
    args: ["baseline:check"],
    deterministic: true,
    categories: ["baseline-drift", "protocol", "final-gate"],
  },
  {
    id: "build",
    description: "TypeScript build and declaration output.",
    command: "pnpm",
    args: ["build"],
    deterministic: true,
    categories: ["static", "final-gate"],
  },
  {
    id: "unit-tests",
    description: "Deterministic unit and integration test suites.",
    command: "pnpm",
    args: ["test"],
    deterministic: true,
    categories: [
      "protocol",
      "mlx",
      "tool",
      "reliability-security",
      "final-gate",
    ],
  },
  {
    id: "format-check",
    description: "Repository formatting and docs formatting check.",
    command: "pnpm",
    args: ["format:check"],
    deterministic: true,
    categories: ["static", "final-gate"],
  },
  {
    id: "examples-typecheck",
    description: "Typecheck packaged extension examples against built exports.",
    command: "pnpm",
    args: ["examples:check"],
    deterministic: true,
    categories: ["packaging", "final-gate"],
  },
  {
    id: "package-smoke",
    description:
      "Pack tarball, inspect contents, install from tarball, and execute packed binary.",
    deterministic: true,
    categories: ["packaging", "final-gate"],
    run: runPackageSmoke,
  },
];

const OPTIONAL_LIVE_SUITES: OptionalLiveSuite[] = [
  {
    id: "mlx-live",
    category: "mlx",
    status: "skipped_with_reason",
    reason:
      "Optional live MLX backend checks require an operator-provided backend and stay outside deterministic release readiness.",
    command:
      "pnpm test:harness -- --suite local-backend --base-url <mlx-url> --provider-model <mlx-model>",
    prerequisites: ["Running MLX OpenAI-compatible backend"],
  },
  {
    id: "desktop-live",
    category: "desktop-optional-live",
    status: "skipped_with_reason",
    reason:
      "Desktop live checks require Cursor desktop, local auth state, and optional MLX backend access.",
    command:
      "pnpm test:harness -- --suite desktop-ui-experimental --include-experimental --base-url <mlx-url> --model <cursor-model> --provider-model <mlx-model>",
    prerequisites: [
      "Cursor desktop installed",
      "Cursor auth available",
      "Running MLX OpenAI-compatible backend",
    ],
  },
];

export function runReleaseCheck(repoRoot = process.cwd()): number {
  const results: GateResult[] = [];
  let blockedReason: string | undefined;
  for (const gate of GATES) {
    const started = Date.now();
    const commandLine = gateCommandLine(gate);
    if (blockedReason !== undefined) {
      results.push({
        ...gate,
        commandLine,
        status: "skipped_with_reason",
        exitCode: null,
        signal: null,
        durationMs: 0,
        reason: blockedReason,
      });
      continue;
    }

    console.log(`\n==> ${gate.id}: ${commandLine}`);
    const result = runGate(gate, repoRoot);
    const gateResult: GateResult = {
      ...gate,
      commandLine,
      status: result.status,
      exitCode: result.exitCode,
      signal: result.signal,
      durationMs: Date.now() - started,
      details: result.details,
    };
    results.push(gateResult);
    if (gateResult.status === "failed") {
      blockedReason = `Skipped because ${gate.id} failed.`;
    }
  }

  const summaryPath = writeReleaseSummary(
    repoRoot,
    results,
    OPTIONAL_LIVE_SUITES,
  );
  console.log(`\nRelease summary: ${summaryPath}`);
  return results.some((result) => result.status === "failed") ? 1 : 0;
}

export function buildReleaseCategoryStatuses(
  results: ReleaseGateStatusInput[],
  optionalSuites: OptionalLiveSuite[] = OPTIONAL_LIVE_SUITES,
): ReleaseCategoryStatus[] {
  const categories: ReleaseCategoryId[] = [
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
  return categories.map((category) => {
    const categoryResults = results.filter((result) =>
      result.categories.includes(category),
    );
    const categoryOptionalSuites = optionalSuites.filter(
      (suite) => suite.category === category,
    );
    const status = categoryResults.some((result) => result.status === "failed")
      ? "failed"
      : categoryResults.length > 0 &&
          categoryResults.every((result) => result.status === "passed")
        ? "passed"
        : "skipped_with_reason";
    return {
      id: category,
      status,
      gateIds: categoryResults.map((result) => result.id),
      optionalSuiteIds: categoryOptionalSuites.map((suite) => suite.id),
      summary: categorySummary(category, status, categoryOptionalSuites),
    };
  });
}

function writeReleaseSummary(
  repoRoot: string,
  results: GateResult[],
  optionalSuites: OptionalLiveSuite[],
): string {
  const outputDir = path.join(repoRoot, RELEASE_CHECK_DIR);
  fs.mkdirSync(outputDir, { recursive: true });
  const summaryPath = path.join(outputDir, "release-summary.json");
  const failed = results.some((result) => result.status === "failed");
  fs.writeFileSync(
    summaryPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        status: failed ? "failed" : "passed",
        generatedAt: new Date().toISOString(),
        deterministic: true,
        categories: buildReleaseCategoryStatuses(results, optionalSuites),
        gates: results.map((result) => ({
          id: result.id,
          description: result.description,
          command: result.commandLine,
          categories: result.categories,
          deterministic: result.deterministic,
          status: result.status,
          exitCode: result.exitCode,
          signal: result.signal,
          durationMs: result.durationMs,
          reason: result.reason,
          details: result.details,
        })),
        optionalLiveSuites: optionalSuites,
      },
      null,
      2,
    )}\n`,
  );
  return summaryPath;
}

function runGate(gate: Gate, repoRoot: string): GateExecution {
  if ("run" in gate) {
    return gate.run(repoRoot);
  }
  const result = spawnSync(gate.command, gate.args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  return {
    status: result.status === 0 ? "passed" : "failed",
    exitCode: result.status,
    signal: result.signal,
    details: {},
  };
}

function runPackageSmoke(repoRoot: string): GateExecution {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-rpc-release-"));
  const packDir = path.join(tempDir, "pack");
  const extractDir = path.join(tempDir, "extract");
  const installDir = path.join(tempDir, "install");
  fs.mkdirSync(packDir, { recursive: true });
  fs.mkdirSync(extractDir, { recursive: true });
  fs.mkdirSync(installDir, { recursive: true });

  const details: Record<string, unknown> = { tempDir };
  const pack = spawnSync("pnpm", ["pack", "--pack-destination", packDir], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (pack.status !== 0) {
    return failedExecution(pack.status, pack.signal, details);
  }

  const tarball = fs
    .readdirSync(packDir)
    .filter((entry) => entry.endsWith(".tgz"))
    .sort()
    .map((entry) => path.join(packDir, entry))
    .at(-1);
  if (tarball === undefined) {
    details.error = "pnpm pack did not create a .tgz artifact";
    return failedExecution(1, null, details);
  }
  details.tarball = tarball;

  const list = spawnSync("tar", ["-tzf", tarball], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (list.status !== 0) {
    details.error = list.stderr;
    return failedExecution(list.status, list.signal, details);
  }
  const entries = list.stdout
    .split(/\r?\n/)
    .filter((entry) => entry.length > 0)
    .sort();
  const missing = REQUIRED_PACKAGE_ENTRIES.filter(
    (required) => !entries.includes(required),
  );
  const unexpectedlyIncluded = entries.filter((entry) =>
    EXCLUDED_PACKAGE_ENTRY_PREFIXES.some((prefix) => entry.startsWith(prefix)),
  );
  details.entryCount = entries.length;
  details.requiredEntries = REQUIRED_PACKAGE_ENTRIES;
  details.excludedEntryPrefixes = EXCLUDED_PACKAGE_ENTRY_PREFIXES;
  if (missing.length > 0) {
    details.missingEntries = missing;
    return failedExecution(1, null, details);
  }
  if (unexpectedlyIncluded.length > 0) {
    details.unexpectedlyIncluded = unexpectedlyIncluded;
    return failedExecution(1, null, details);
  }

  const extract = spawnSync("tar", ["-xzf", tarball, "-C", extractDir], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (extract.status !== 0) {
    return failedExecution(extract.status, extract.signal, details);
  }
  const packedPackageJsonPath = path.join(
    extractDir,
    "package",
    "package.json",
  );
  const packedPackageJson = JSON.parse(
    fs.readFileSync(packedPackageJsonPath, "utf8"),
  ) as { bin?: Record<string, string>; files?: string[] };
  const expectedBins = new Map([["cursorkit", "./dist/src/cli.js"]]);
  const invalidBins = Array.from(expectedBins).filter(
    ([name, target]) => packedPackageJson.bin?.[name] !== target,
  );
  if (invalidBins.length > 0) {
    details.error =
      "packed package.json bin entries do not match expected bins";
    details.bin = packedPackageJson.bin;
    details.invalidBins = invalidBins.map(([name]) => name);
    return failedExecution(1, null, details);
  }
  details.bin = packedPackageJson.bin;

  fs.writeFileSync(
    path.join(installDir, "package.json"),
    `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`,
  );
  const install = spawnSync(
    "pnpm",
    ["add", "--offline", "--ignore-scripts", tarball],
    {
      cwd: installDir,
      env: process.env,
      stdio: "inherit",
    },
  );
  if (install.status !== 0) {
    details.error =
      "offline install-from-tarball smoke failed; run pnpm install first to seed the pnpm store";
    return failedExecution(install.status, install.signal, details);
  }

  const cursorkitBin = path.join(
    installDir,
    "node_modules",
    ".bin",
    "cursorkit",
  );
  const help = spawnSync(cursorkitBin, ["--help"], {
    cwd: installDir,
    env: process.env,
    encoding: "utf8",
  });
  details.binary = "cursorkit --help";
  if (help.status !== 0 || !help.stdout.includes("cursorkit")) {
    details.error =
      help.stderr || "cursorkit --help did not print expected help";
    details.stdout = help.stdout;
    return failedExecution(help.status ?? 1, help.signal, details);
  }

  return {
    status: "passed",
    exitCode: 0,
    signal: null,
    details,
  };
}

function failedExecution(
  exitCode: number | null,
  signal: NodeJS.Signals | null,
  details: Record<string, unknown>,
): GateExecution {
  return {
    status: "failed",
    exitCode,
    signal,
    details,
  };
}

function gateCommandLine(gate: Gate): string {
  if ("command" in gate) {
    return [gate.command, ...gate.args].join(" ");
  }
  return PACKAGE_SMOKE_COMMAND;
}

function categorySummary(
  category: ReleaseCategoryId,
  status: GateStatus,
  optionalSuites: OptionalLiveSuite[],
): string {
  const optionalNote =
    optionalSuites.length === 0
      ? ""
      : ` Optional live: ${optionalSuites
          .map((suite) => `${suite.id} ${suite.status}`)
          .join(", ")}.`;
  switch (category) {
    case "baseline-drift":
      return `Generated route/config/docs inventory and release summary drift checks ${status}.${optionalNote}`;
    case "static":
      return `Build, formatting, and repository static checks ${status}.${optionalNote}`;
    case "protocol":
      return `Protocol route contracts, fixture/replay tests, and Connect shape coverage ${status}.${optionalNote}`;
    case "mlx":
      return `MLX scripted contract coverage ${status}.${optionalNote}`;
    case "tool":
      return `Agent tool runtime schema/result coverage ${status}.${optionalNote}`;
    case "desktop-optional-live":
      return `Desktop live acceptance remains optional and separately reported ${status}.${optionalNote}`;
    case "reliability-security":
      return `Reliability and security regression coverage ${status}.${optionalNote}`;
    case "packaging":
      return `Examples typecheck and packed artifact smoke ${status}.${optionalNote}`;
    case "final-gate":
      return `Deterministic final release gate ${status}.${optionalNote}`;
    default: {
      const exhaustive: never = category;
      return exhaustive;
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runReleaseCheck();
}
