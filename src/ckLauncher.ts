import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { lookup } from "node:dns/promises";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Command, InvalidArgumentError } from "commander";

import { loadConfig } from "./config.js";
import {
  buildLocalDesktopModelEntry,
  mergeLocalAgentBackendUrlsIntoApplicationUser,
  mergeLocalDesktopModelsIntoApplicationUser,
} from "./cursorDesktopState.js";
// Re-exported for backwards compatibility (callers/tests import these from
// ckLauncher); the implementations now live in cursorDesktopState.
export {
  buildLocalDesktopModelEntry,
  mergeLocalAgentBackendUrlsIntoApplicationUser,
  mergeLocalDesktopModelsIntoApplicationUser,
};
import {
  startDesktopConnectProxy,
  type DesktopConnectProxy,
} from "./desktopConnectProxy.js";
import {
  DESKTOP_CERT_PATH,
  DESKTOP_HOSTNAME,
  DESKTOP_HOSTNAMES,
  DESKTOP_KEY_PATH,
  desktopCertificateStatus,
  desktopDnsStatus,
  desktopEnv,
  desktopTrustCommand,
  localModelBackendStatus,
  upstreamReachabilityStatus,
  writeDesktopCertificate,
} from "./desktop.js";
import {
  AGENT_RUN_PATH,
  AGENT_RUN_SSE_PATH,
  AVAILABLE_MODELS_PATH,
  BIDI_APPEND_PATH,
  GET_DEFAULT_MODEL_FOR_CLI_PATH,
  GET_USABLE_MODELS_PATH,
  STREAM_CHAT_WITH_TOOLS_PATH,
} from "./routes.js";
import {
  StepList,
  bold,
  brandHeader,
  cyan,
  dim,
  glyph,
  gray,
  green,
  note,
  red,
  uiStream,
  withSpinner,
  yellow,
} from "./ui/index.js";

export type CkCommand =
  | "launch"
  | "test"
  | "doctor"
  | "cert"
  | "route"
  | "stop";
export type CkProfileMode = "isolated" | "default";
export type CkRouteMethod = "pf" | "direct";
export type CkRouteAction = "plan" | "status" | "rollback";

export interface CkArgs {
  command: CkCommand;
  dryRun: boolean;
  profileMode: CkProfileMode;
  timeoutMs: number;
  routeMethod: CkRouteMethod;
  routeAction: CkRouteAction;
  debugPort?: number;
  instanceId?: string;
  seedAuthFromDefault?: boolean;
}

export interface CommandSpec {
  executable: string;
  args: string[];
  env?: Record<string, string>;
}

export interface CkLaunchPlan {
  bridge: CommandSpec;
  cursor: CommandSpec;
  bridgePort: number;
  connectProxyPort?: number;
  agentHttpPort?: number;
  stateDir: string;
  statePath: string;
  logPath: string;
  connectProxyLogPath?: string;
  userDataDir: string | undefined;
  extensionsDir: string;
  workspacePath: string;
  profileMode: CkProfileMode;
  debugPort?: number;
  instanceId?: string;
  seedAuthFromDefault: boolean;
  authSeedStatus?: CursorAuthSeedStatus;
  localModelSeedStatus?: CursorLocalModelSeedStatus;
}

export type CursorAuthSeedStatus =
  | "not-requested"
  | "not-isolated"
  | "sqlite-unavailable"
  | "source-missing"
  | "no-auth-rows"
  | "seeded";
export type CursorLocalModelSeedStatus =
  | "not-isolated"
  | "sqlite-unavailable"
  | "state-missing"
  | "no-local-models"
  | "seeded";

export interface CkRoutePlan {
  method: CkRouteMethod;
  hostname: string;
  hostnames: string[];
  bridgePort: number;
  upstreamConnectHost: string | undefined;
  warnings: string[];
  setupCommands: CommandSpec[];
  verificationCommands: CommandSpec[];
  rollbackCommands: CommandSpec[];
}

export interface RouteInventoryObservation {
  method: string;
  path: string;
  contentType: string;
  status: number;
  framing: string;
  policy: string;
  outcome: string;
}

export interface RouteInventoryPathSummary {
  path: string;
  count: number;
  methods: string[];
  statuses: number[];
  framings: string[];
  policies: string[];
  outcomes: string[];
}

export type DesktopRouteCategory =
  | "model-metadata"
  | "local-agent-candidate"
  | "pass-through"
  | "decoded-only"
  | "unsupported"
  | "unknown";

export interface DesktopRouteCategorySummary {
  path: string;
  category: DesktopRouteCategory;
  reason: string;
}

export interface DesktopTestReport {
  routeInventorySeen: boolean;
  modelRoutesSeen: string[];
  missingModelRoutes: string[];
  observedPaths: string[];
  routeSummary: RouteInventoryPathSummary[];
  routeCategories: DesktopRouteCategorySummary[];
  failedRoutes: RouteInventoryObservation[];
  passThroughRoutes: RouteInventoryObservation[];
  diagnosis: string[];
}

export interface CkProcessGroup {
  bridge: ChildProcess;
  log: fs.WriteStream;
  connectProxy?: DesktopConnectProxy;
}

interface CkState {
  bridgePid?: number;
  bridgeCommand?: string;
  bridgePort?: number;
  connectProxyPort?: number;
  agentHttpPort?: number;
  logPath?: string;
  connectProxyLogPath?: string;
  profileMode?: CkProfileMode;
  userDataDir?: string;
  extensionsDir?: string;
  workspacePath?: string;
  debugPort?: number;
  instanceId?: string;
  seedAuthFromDefault?: boolean;
  authSeedStatus?: CursorAuthSeedStatus;
  localModelSeedStatus?: CursorLocalModelSeedStatus;
  startedAt?: string;
}

export const CK_STATE_DIR = path.join(".cursor-rpc", "ck");
export const CK_STATE_PATH = path.join(CK_STATE_DIR, "state.json");
const DEFAULT_CURSOR_USER_DATA_DIR = path.join(
  process.env.HOME ?? "",
  "Library",
  "Application Support",
  "Cursor",
);
const CURSOR_AUTH_KEY_PATTERN = "cursorAuth/*";
const DEFAULT_ROUTE_INVENTORY_TIMEOUT_MS = 15_000;
const MODEL_ROUTE_PATHS = [
  AVAILABLE_MODELS_PATH,
  GET_USABLE_MODELS_PATH,
  GET_DEFAULT_MODEL_FOR_CLI_PATH,
];
const LOCAL_AGENT_CANDIDATE_PATHS = [
  AGENT_RUN_PATH,
  AGENT_RUN_SSE_PATH,
  BIDI_APPEND_PATH,
  STREAM_CHAT_WITH_TOOLS_PATH,
];

const CK_ENV_HELP = `
cursorkit ck launches an isolated Cursor against a local desktop-proxy bridge.
Bridge logs stream live during \`ck\` and are written to .cursor-rpc/ck/bridge.log.`;

function parsePositiveInt(flag: string): (value: string) => number {
  return (value) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new InvalidArgumentError(`${flag} must be a positive integer`);
    }
    return parsed;
  };
}

function parseProfile(value: string): CkProfileMode {
  if (value !== "isolated" && value !== "default") {
    throw new InvalidArgumentError("--profile must be isolated or default");
  }
  return value;
}

function parseMethod(value: string): CkRouteMethod {
  if (value !== "pf" && value !== "direct") {
    throw new InvalidArgumentError("--method must be pf or direct");
  }
  return value;
}

function parseInstanceId(value: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new InvalidArgumentError(
      "--instance-id must use only letters, numbers, dot, underscore, or dash",
    );
  }
  return value;
}

function normalizeRouteAction(action: string | undefined): CkRouteAction {
  if (action === undefined) return "plan";
  if (action === "status" || action === "rollback") return action;
  throw new Error("ck route subcommand must be status or rollback");
}

/**
 * Shared launch/test options. Defaults are applied later in {@link ckArgsFromOpts}
 * (not via commander) so the same flag works before or after a subcommand name:
 * an unset option stays absent and the parent value wins via `optsWithGlobals`.
 */
function applyLaunchOptions(cmd: Command): Command {
  return cmd
    .option("--print", "print commands without launching")
    .option(
      "--use-default-profile",
      "reuse your logged-in Cursor profile for auth-sensitive testing",
    )
    .option("--profile <mode>", "isolated | default", parseProfile)
    .option(
      "--timeout-ms <ms>",
      "launch/test route-inventory wait time",
      parsePositiveInt("--timeout-ms"),
    )
    .option(
      "--debug-port <port>",
      "launch Cursor with a Chromium remote debugging port",
      parsePositiveInt("--debug-port"),
    )
    .option(
      "--instance-id <name>",
      "use a fresh isolated ck state/profile subdirectory",
      parseInstanceId,
    )
    .option(
      "--seed-auth-from-default",
      "copy Cursor auth rows from your default profile",
    )
    .option(
      "--no-seed-auth-from-default",
      "start isolated Cursor without copying auth rows",
    );
}

function ckArgsFromOpts(
  command: CkCommand,
  opts: Record<string, unknown>,
  routeAction: CkRouteAction,
): CkArgs {
  const profileMode: CkProfileMode =
    (opts.profile as CkProfileMode | undefined) ??
    (opts.useDefaultProfile === true ? "default" : "isolated");
  return compactCkArgs({
    command,
    dryRun: opts.print === true,
    profileMode,
    timeoutMs:
      (opts.timeoutMs as number | undefined) ??
      DEFAULT_ROUTE_INVENTORY_TIMEOUT_MS,
    routeMethod: (opts.method as CkRouteMethod | undefined) ?? "pf",
    routeAction,
    debugPort: opts.debugPort as number | undefined,
    instanceId: opts.instanceId as string | undefined,
    seedAuthFromDefault: opts.seedAuthFromDefault as boolean | undefined,
  });
}

/**
 * Build the commander program for `ck`. `dispatch` receives the resolved
 * {@link CkArgs}; the real binary runs the command while {@link parseCkArgs}
 * captures the args for tests.
 */
export function buildCkProgram(
  dispatch: (args: CkArgs) => void | Promise<void>,
): Command {
  const program = new Command();
  program
    .name("ck")
    .description("desktop proxy launcher for Cursor")
    .addHelpText("after", CK_ENV_HELP);

  applyLaunchOptions(program).action(function (this: Command) {
    return dispatch(ckArgsFromOpts("launch", this.optsWithGlobals(), "plan"));
  });

  applyLaunchOptions(
    program
      .command("test")
      .description(
        "launch, monitor route inventory, print diagnosis, then stop bridge",
      ),
  ).action(function (this: Command) {
    return dispatch(ckArgsFromOpts("test", this.optsWithGlobals(), "plan"));
  });

  program
    .command("doctor")
    .description("check desktop launch readiness")
    .action(function (this: Command) {
      return dispatch(ckArgsFromOpts("doctor", this.optsWithGlobals(), "plan"));
    });

  program
    .command("cert")
    .description("generate desktop proxy certificate")
    .action(function (this: Command) {
      return dispatch(ckArgsFromOpts("cert", this.optsWithGlobals(), "plan"));
    });

  program
    .command("route [action]")
    .description(
      "print manual desktop routing setup and rollback commands (action: status | rollback)",
    )
    .option("--method <method>", "pf | direct", parseMethod)
    .action(function (this: Command, action: string | undefined) {
      return dispatch(
        ckArgsFromOpts(
          "route",
          this.optsWithGlobals(),
          normalizeRouteAction(action),
        ),
      );
    });

  program
    .command("stop")
    .description("stop ck-owned bridge process")
    .action(function (this: Command) {
      return dispatch(ckArgsFromOpts("stop", this.optsWithGlobals(), "plan"));
    });

  return program;
}

/**
 * Pure argument parser built on the commander program: returns the resolved
 * {@link CkArgs} (or throws on invalid input) without running the command.
 */
export function parseCkArgs(argv: string[]): CkArgs {
  let captured: CkArgs | undefined;
  const program = buildCkProgram((args) => {
    captured = args;
  });
  // Throw (rather than exit) on invalid input, and stay silent; applied to
  // every command since subcommands like `route` validate their own options.
  const makeParseOnly = (cmd: Command): void => {
    cmd.exitOverride();
    cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} });
    cmd.commands.forEach(makeParseOnly);
  };
  makeParseOnly(program);
  program.parse(argv);
  if (captured === undefined) {
    throw new Error("ck: no command parsed");
  }
  return captured;
}

function compactCkArgs(args: CkArgs): CkArgs {
  const { debugPort, instanceId, seedAuthFromDefault, ...rest } = args;
  return {
    ...rest,
    ...(debugPort !== undefined ? { debugPort } : {}),
    ...(instanceId !== undefined ? { instanceId } : {}),
    ...(seedAuthFromDefault !== undefined ? { seedAuthFromDefault } : {}),
  };
}

export function buildCkLaunchPlan(options: {
  env: NodeJS.ProcessEnv;
  bridgePort: number;
  connectProxyPort?: number;
  agentHttpPort?: number;
  profileMode?: CkProfileMode;
  debugPort?: number;
  instanceId?: string;
  seedAuthFromDefault?: boolean;
  cwd?: string;
  /**
   * Folder Cursor opens as its workspace. Defaults to {@link cwd}; set it to
   * decouple the opened project from the ck state directory (which stays under
   * {@link cwd}), so an embedding launcher can keep certs/state/logs in a
   * scratch dir while still opening the user's real repo.
   */
  workspacePath?: string;
}): CkLaunchPlan {
  const cwd = options.cwd ?? process.cwd();
  const workspacePath = options.workspacePath ?? cwd;
  const profileMode = options.profileMode ?? "isolated";
  const stateDir =
    options.instanceId === undefined
      ? path.join(cwd, CK_STATE_DIR)
      : path.join(cwd, CK_STATE_DIR, options.instanceId);
  const userDataDir =
    profileMode === "isolated" ? path.join(stateDir, "user-data") : undefined;
  const extensionsDir = path.join(stateDir, "extensions");
  const connectProxyPort =
    profileMode === "isolated" ? options.connectProxyPort : undefined;
  const agentHttpPort =
    profileMode === "isolated" ? options.agentHttpPort : undefined;
  const connectProxyLogPath =
    connectProxyPort === undefined
      ? undefined
      : path.join(stateDir, "connect-proxy.log");
  const bridgeEnv = desktopEnv({
    ...pickDisplayableBridgeEnv(options.env),
    BRIDGE_PORT: String(options.bridgePort),
    ...(agentHttpPort !== undefined
      ? {
          BRIDGE_DESKTOP_AGENT_HTTP_PORT: String(agentHttpPort),
        }
      : {}),
    BRIDGE_LOG_LEVEL: options.env.BRIDGE_LOG_LEVEL ?? "debug",
    BRIDGE_CERT_PATH: options.env.BRIDGE_CERT_PATH ?? DESKTOP_CERT_PATH,
    BRIDGE_KEY_PATH: options.env.BRIDGE_KEY_PATH ?? DESKTOP_KEY_PATH,
  });
  if (
    agentHttpPort !== undefined &&
    bridgeEnv.BRIDGE_AGENT_PUBLIC_ORIGIN === undefined
  ) {
    bridgeEnv.BRIDGE_AGENT_PUBLIC_ORIGIN = `https://127.0.0.1:${options.bridgePort}`;
  }

  return {
    bridge: {
      ...bridgeCommandSpec(cwd),
      env: stringEnv(bridgeEnv),
    },
    cursor: cursorCommandSpec(
      profileMode,
      userDataDir,
      extensionsDir,
      options.debugPort,
      workspacePath,
      options.bridgePort,
      profileMode === "isolated",
      connectProxyPort,
    ),
    bridgePort: options.bridgePort,
    ...(connectProxyPort !== undefined ? { connectProxyPort } : {}),
    ...(agentHttpPort !== undefined ? { agentHttpPort } : {}),
    stateDir,
    statePath: path.join(stateDir, "state.json"),
    logPath: path.join(stateDir, "bridge.log"),
    ...(connectProxyLogPath !== undefined ? { connectProxyLogPath } : {}),
    userDataDir,
    extensionsDir,
    workspacePath,
    profileMode,
    seedAuthFromDefault:
      profileMode === "isolated" && options.seedAuthFromDefault !== false,
    authSeedStatus: "not-requested",
    ...(options.debugPort !== undefined
      ? { debugPort: options.debugPort }
      : {}),
    ...(options.instanceId !== undefined
      ? { instanceId: options.instanceId }
      : {}),
  };
}

export function commandForDisplay(spec: CommandSpec): string {
  const env =
    spec.env === undefined
      ? []
      : Object.entries(spec.env)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(
            ([key, value]) =>
              `${key}=${shellQuote(displayEnvValue(key, value))}`,
          );
  const command = [spec.executable, ...spec.args].map(shellQuote);
  return [...env, ...command].join(" ");
}

export async function buildCkRoutePlan(
  options: {
    method?: CkRouteMethod;
    bridgePort?: number;
    upstreamConnectHost?: string;
    cwd?: string;
  } = {},
): Promise<CkRoutePlan> {
  const method = options.method ?? "pf";
  const bridgePort = options.bridgePort ?? (method === "direct" ? 443 : 9443);
  const cwd = options.cwd ?? process.cwd();
  const upstreamConnectHost =
    options.upstreamConnectHost ?? (await detectUpstreamConnectHost());
  const warnings: string[] = [];
  if (upstreamConnectHost === undefined) {
    warnings.push(
      `Could not resolve a non-local ${DESKTOP_HOSTNAME} address. Set CURSOR_UPSTREAM_CONNECT_HOST manually before redirecting DNS to localhost.`,
    );
  }
  if (method === "direct") {
    warnings.push(
      "Direct mode binds the bridge to port 443, which may require elevated privileges on some machines.",
    );
  }

  const hostnames = [...DESKTOP_HOSTNAMES];
  const hostsLine = `127.0.0.1 ${hostnames.join(" ")}`;
  const bridgeEnv = {
    BRIDGE_PORT: String(bridgePort),
    CURSOR_UPSTREAM_CONNECT_HOST: upstreamConnectHost ?? "<real-api2-address>",
    BRIDGE_CERT_PATH: DESKTOP_CERT_PATH,
    BRIDGE_KEY_PATH: DESKTOP_KEY_PATH,
  };
  const setupCommands: CommandSpec[] = [
    { executable: "pnpm", args: ["ck", "cert"] },
    {
      executable: "sudo",
      args: desktopTrustCommand(DESKTOP_CERT_PATH).slice(1),
    },
    {
      executable: "sudo",
      args: ["sh", "-c", `printf "\\n${hostsLine}\\n" >> /etc/hosts`],
    },
  ];

  if (method === "pf") {
    setupCommands.push(
      { executable: "mkdir", args: ["-p", path.join(cwd, CK_STATE_DIR)] },
      {
        executable: "sh",
        args: [
          "-c",
          `printf 'rdr pass on lo0 inet proto tcp from any to 127.0.0.1 port 443 -> 127.0.0.1 port ${bridgePort}\\n' > ${shellQuote(path.join(cwd, CK_STATE_DIR, "pf.conf"))}`,
        ],
      },
      {
        executable: "sudo",
        args: ["pfctl", "-ef", path.join(cwd, CK_STATE_DIR, "pf.conf")],
      },
    );
  }

  setupCommands.push({
    executable: "pnpm",
    args: ["exec", "tsx", "src/cli.ts", "desktop-proxy"],
    env: bridgeEnv,
  });

  const verificationCommands: CommandSpec[] = [
    {
      executable: "pnpm",
      args: ["ck", "test", "--use-default-profile", "--timeout-ms", "30000"],
    },
  ];
  const rollbackCommands: CommandSpec[] = [
    { executable: "pnpm", args: ["ck", "stop"] },
    {
      executable: "sudo",
      args: [
        "perl",
        "-0pi",
        "-e",
        `s/^127\\.0\\.0\\.1\\s+${hostnames.map(escapeRegExp).join("\\s+")}\\n//mg`,
        "/etc/hosts",
      ],
    },
  ];
  if (method === "pf") {
    rollbackCommands.push({ executable: "sudo", args: ["pfctl", "-d"] });
  }
  rollbackCommands.push({
    executable: "pkill",
    args: ["-x", "Cursor"],
  });

  return {
    method,
    hostname: DESKTOP_HOSTNAME,
    hostnames,
    bridgePort,
    upstreamConnectHost,
    warnings,
    setupCommands,
    verificationCommands,
    rollbackCommands,
  };
}

export function containsPrivilegedCommand(spec: CommandSpec): boolean {
  const values = [spec.executable, ...spec.args];
  return values.some(
    (value) =>
      /(^|\/)(sudo|security|pfctl)$/.test(value) ||
      value.includes("/etc/hosts"),
  );
}

export function routeInventoryTimeoutDiagnosis(): string[] {
  return [
    "No desktop route inventory observed yet. Per-instance routing may not affect this Cursor network path.",
    "Run `pnpm ck route` to print manual fallback routing and rollback commands.",
  ];
}

export function analyzeRouteInventoryLog(logText: string): DesktopTestReport {
  const observations = parseRouteInventoryObservations(logText);
  const observedPaths = uniqueSorted(
    observations.map((observation) => observation.path),
  );
  const routeSummary = summarizeRouteInventory(observations);
  const routeCategories = categorizeRouteInventory(routeSummary);
  const modelRoutesSeen = MODEL_ROUTE_PATHS.filter((path) =>
    observedPaths.includes(path),
  );
  const missingModelRoutes = MODEL_ROUTE_PATHS.filter(
    (path) => !observedPaths.includes(path),
  );
  const failedRoutes = observations.filter((observation) => {
    return observation.status >= 400;
  });
  const passThroughRoutes = observations.filter((observation) => {
    return observation.outcome === "pass-through";
  });

  return {
    routeInventorySeen: observations.length > 0,
    modelRoutesSeen,
    missingModelRoutes,
    observedPaths,
    routeSummary,
    routeCategories,
    failedRoutes,
    passThroughRoutes,
    diagnosis: desktopTestDiagnosis({
      routeInventorySeen: observations.length > 0,
      modelRoutesSeen,
      missingModelRoutes,
      observedPaths,
      routeSummary,
      failedRoutes,
      passThroughRoutes,
    }),
  };
}

function categorizeRouteInventory(
  routeSummary: RouteInventoryPathSummary[],
): DesktopRouteCategorySummary[] {
  return routeSummary.map((summary) => {
    if (MODEL_ROUTE_PATHS.includes(summary.path)) {
      return {
        path: summary.path,
        category: "model-metadata",
        reason: "known model-list/default-model route",
      };
    }
    if (LOCAL_AGENT_CANDIDATE_PATHS.includes(summary.path)) {
      return {
        path: summary.path,
        category: "local-agent-candidate",
        reason: "known route that can carry desktop prompt execution",
      };
    }
    if (summary.policies.includes("pass-through")) {
      return {
        path: summary.path,
        category: "pass-through",
        reason: "observed but intentionally forwarded upstream",
      };
    }
    if (summary.policies.includes("intercept")) {
      return {
        path: summary.path,
        category: "decoded-only",
        reason:
          "intercepted by bridge without desktop-specific acceptance proof",
      };
    }
    if (summary.statuses.some((status) => status >= 400)) {
      return {
        path: summary.path,
        category: "unsupported",
        reason: "observed with an HTTP error status",
      };
    }
    return {
      path: summary.path,
      category: "unknown",
      reason: "observed route needs fixture or traffic classification",
    };
  });
}

function summarizeRouteInventory(
  observations: RouteInventoryObservation[],
): RouteInventoryPathSummary[] {
  const byPath = new Map<string, RouteInventoryObservation[]>();
  for (const observation of observations) {
    const existing = byPath.get(observation.path) ?? [];
    existing.push(observation);
    byPath.set(observation.path, existing);
  }
  return Array.from(byPath.entries())
    .map(([path, entries]) => ({
      path,
      count: entries.length,
      methods: uniqueSorted(entries.map((entry) => entry.method)),
      statuses: uniqueSortedNumbers(entries.map((entry) => entry.status)),
      framings: uniqueSorted(entries.map((entry) => entry.framing)),
      policies: uniqueSorted(entries.map((entry) => entry.policy)),
      outcomes: uniqueSorted(entries.map((entry) => entry.outcome)),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function parseRouteInventoryObservations(
  logText: string,
): RouteInventoryObservation[] {
  const observations: RouteInventoryObservation[] = [];
  for (const line of logText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (parsed.message !== "desktop route inventory") {
        continue;
      }
      observations.push({
        method: stringField(parsed.method),
        path: stringField(parsed.path),
        contentType: stringField(parsed.contentType),
        status: numberField(parsed.status),
        framing: stringField(parsed.framing),
        policy: stringField(parsed.policy),
        outcome: stringField(parsed.outcome),
      });
    } catch {
      continue;
    }
  }
  return observations;
}

function desktopTestDiagnosis(report: {
  routeInventorySeen: boolean;
  modelRoutesSeen: string[];
  missingModelRoutes: string[];
  observedPaths: string[];
  routeSummary: RouteInventoryPathSummary[];
  failedRoutes: RouteInventoryObservation[];
  passThroughRoutes: RouteInventoryObservation[];
}): string[] {
  if (!report.routeInventorySeen) {
    return routeInventoryTimeoutDiagnosis();
  }

  const diagnosis: string[] = [];
  if (report.modelRoutesSeen.length === 0) {
    diagnosis.push(
      "Desktop traffic reached the bridge, but none of the known model-list RPCs were observed. The desktop app may be using a different model route than cursor-agent.",
    );
  } else if (report.missingModelRoutes.length > 0) {
    diagnosis.push(
      "Desktop traffic reached at least one known model-list RPC, but not the full CLI-derived model surface. Missing routes may explain a partial or empty picker.",
    );
  } else {
    diagnosis.push(
      "All known CLI-derived model-list RPCs reached the bridge. If local-qwen is still missing, the desktop app likely needs additional app-specific model metadata or another desktop-only route.",
    );
  }

  if (report.failedRoutes.length > 0) {
    diagnosis.push(
      "One or more observed routes returned HTTP errors; inspect the bridge log for status and policy details.",
    );
  }

  if (report.passThroughRoutes.length > 0) {
    diagnosis.push(
      "Some observed routes passed through to upstream. This is expected for non-intercepted routes and useful for route discovery.",
    );
  }

  if (report.observedPaths.length > 0) {
    diagnosis.push(
      "Use the route summary to decide the next typed interceptor instead of guessing.",
    );
  }

  return diagnosis;
}

export async function runCk(argv = process.argv): Promise<void> {
  const program = buildCkProgram(runCkCommand);
  await program.parseAsync(argv);
}

/** Attach the `ck` desktop launcher as a subcommand group of another program. */
export function registerCk(program: Command): void {
  program.addCommand(buildCkProgram(runCkCommand));
}

async function runCkCommand(parsed: CkArgs): Promise<void> {
  if (parsed.command === "cert") {
    await printCertInstructions();
    return;
  }
  if (parsed.command === "route") {
    await printRoute(parsed.routeAction, parsed.routeMethod);
    return;
  }
  if (parsed.command === "doctor") {
    await printDoctor();
    return;
  }
  if (parsed.command === "stop") {
    await stopBridgeFromState();
    return;
  }

  const bridgePort = await chooseBridgePort();
  const connectProxyPort =
    parsed.profileMode === "isolated" ? await chooseFreePort() : undefined;
  const agentHttpPort =
    parsed.profileMode === "isolated" ? await chooseFreePort() : undefined;
  // CK_WORKSPACE_PATH lets an embedding launcher open the user's real repo while
  // keeping ck's state/cert/log directory under cwd (a scratch dir). Unset for
  // normal `pnpm ck`, where the workspace is the current directory.
  const workspacePathEnv = process.env.CK_WORKSPACE_PATH;
  const workspacePath =
    workspacePathEnv !== undefined && workspacePathEnv.length > 0
      ? workspacePathEnv
      : undefined;
  const plan = buildCkLaunchPlan({
    env: process.env,
    bridgePort,
    connectProxyPort,
    agentHttpPort,
    profileMode: parsed.profileMode,
    debugPort: parsed.debugPort,
    instanceId: parsed.instanceId,
    seedAuthFromDefault: parsed.seedAuthFromDefault,
    ...(workspacePath !== undefined ? { workspacePath } : {}),
  });

  if (parsed.dryRun) {
    printPlan(plan);
    return;
  }

  const cert = await withSpinner(
    "preparing desktop certificate",
    () => writeDesktopCertificate(),
    {
      success: (result) =>
        result.created
          ? "generated desktop proxy certificate"
          : "desktop certificate ready",
    },
  );
  if (cert.created) {
    printTrustInstructions(cert.certPath);
  }

  if (parsed.command === "test") {
    await testDesktopLaunch(plan, parsed.timeoutMs);
  } else {
    await launch(plan, parsed.timeoutMs);
  }
}

export async function chooseBridgePort(): Promise<number> {
  if (await portIsFree(9443)) {
    return 9443;
  }
  return chooseFreePort();
}

async function chooseFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Unable to allocate bridge port"));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

/** Write a single human-facing line to the UI stream (stderr). */
function out(line = ""): void {
  uiStream().write(`${line}\n`);
}

interface BridgeStartOptions {
  /** Mirror live bridge stdout/stderr to this process (off during `test`). */
  mirror?: boolean;
  /** Suppress orchestration log lines (when a StepList is animating instead). */
  quiet?: boolean;
}

async function launch(plan: CkLaunchPlan, timeoutMs: number): Promise<void> {
  out(`\n${brandHeader("desktop launch")}\n`);
  const { bridge, log, connectProxy } = await startBridge(plan, {
    mirror: true,
  });

  const routeSeen = waitForRouteInventory(bridge, timeoutMs);

  launchCursor(plan, {});

  out(
    `${green(glyph.tick())} ${bold("ck ready")}  ${dim(`https://127.0.0.1:${plan.bridgePort}`)} ${dim(`(log: ${plan.logPath})`)}`,
  );

  const observed = await routeSeen;
  if (observed) {
    out(`${green(glyph.tick())} desktop route inventory observed`);
  } else {
    for (const line of routeInventoryTimeoutDiagnosis()) {
      out(`${yellow(glyph.warn())} ${line}`);
    }
  }

  await new Promise<void>((resolve) => {
    bridge.on("exit", () => {
      log.end();
      void connectProxy?.close();
      resolve();
    });
  });
}

async function testDesktopLaunch(
  plan: CkLaunchPlan,
  timeoutMs: number,
): Promise<void> {
  out(`\n${brandHeader("desktop test")}\n`);
  const steps = new StepList(
    [
      { id: "bridge", label: "start bridge" },
      { id: "cursor", label: "launch Cursor" },
      { id: "inventory", label: "monitor route inventory" },
    ],
    { title: dim(`bridge log: ${plan.logPath}`) },
  ).start();

  steps.setActive("bridge");
  const { bridge, log, connectProxy } = await startBridge(plan, {
    mirror: false,
    quiet: true,
  });
  steps.setDone("bridge", `127.0.0.1:${plan.bridgePort}`);
  try {
    steps.setActive("cursor");
    launchCursor(plan, { quiet: true });
    steps.setDone(
      "cursor",
      plan.profileMode === "isolated" ? "isolated profile" : "default profile",
    );

    steps.setActive("inventory", `up to ${timeoutMs}ms`);
    await delay(timeoutMs);

    const logText = fs.existsSync(plan.logPath)
      ? fs.readFileSync(plan.logPath, "utf8")
      : "";
    const report = analyzeRouteInventoryLog(logText);
    steps.setDone(
      "inventory",
      report.routeInventorySeen ? "observed" : "none seen",
    );
    steps.stop();
    writeLatestStatus(plan, report);
    printDesktopTestReport(plan, report);
  } catch (error) {
    steps.setFailed("inventory");
    steps.stop();
    throw error;
  } finally {
    bridge.kill("SIGTERM");
    await connectProxy?.close();
    log.end();
    if (plan.userDataDir !== undefined) {
      cleanupIsolatedCursorProcesses(plan.userDataDir);
    }
  }
}

async function startBridge(
  plan: CkLaunchPlan,
  options: BridgeStartOptions = {},
): Promise<CkProcessGroup> {
  const { mirror = true, quiet = false } = options;
  fs.mkdirSync(plan.stateDir, { recursive: true });
  if (plan.userDataDir !== undefined) {
    fs.mkdirSync(plan.userDataDir, { recursive: true });
  }
  fs.mkdirSync(plan.extensionsDir, { recursive: true });
  plan.authSeedStatus = seedCursorAuthFromDefault(plan);
  if (!quiet) {
    if (plan.authSeedStatus === "seeded") {
      out(
        `${green(glyph.tick())} seeded isolated Cursor profile with default auth rows`,
      );
    } else if (
      plan.seedAuthFromDefault &&
      plan.authSeedStatus !== "not-isolated"
    ) {
      out(
        `${yellow(glyph.warn())} Cursor auth seeding status: ${plan.authSeedStatus}`,
      );
    }
  }
  plan.localModelSeedStatus = seedLocalModelsIntoCursorState(plan);
  if (!quiet) {
    if (plan.localModelSeedStatus === "seeded") {
      out(
        `${green(glyph.tick())} seeded isolated Cursor profile with local model entries`,
      );
    } else if (plan.localModelSeedStatus !== "not-isolated") {
      out(
        `${yellow(glyph.warn())} Cursor local model seeding status: ${plan.localModelSeedStatus}`,
      );
    }
  }
  configureCursorNodeTlsEnv(plan);

  assertSafe(plan.bridge);
  assertSafe(plan.cursor);

  if (!quiet) {
    out(
      `${cyan(glyph.arrow())} starting bridge on 127.0.0.1:${plan.bridgePort} ${dim(`(log: ${plan.logPath})`)}`,
    );
  }
  const log = fs.createWriteStream(plan.logPath, { flags: "w" });
  const bridge = spawn(plan.bridge.executable, plan.bridge.args, {
    env: { ...process.env, ...plan.bridge.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  attachBridgeOutput(bridge, log, mirror);
  writeState(plan, bridge);
  await waitForBridgeListening(bridge);
  const connectProxy = await startConnectProxy(plan, quiet);
  return {
    bridge,
    log,
    ...(connectProxy === undefined ? {} : { connectProxy }),
  };
}

async function startConnectProxy(
  plan: CkLaunchPlan,
  quiet = false,
): Promise<DesktopConnectProxy | undefined> {
  if (
    plan.connectProxyPort === undefined ||
    plan.connectProxyLogPath === undefined
  ) {
    return undefined;
  }
  fs.writeFileSync(plan.connectProxyLogPath, "");
  if (!quiet) {
    out(
      `${cyan(glyph.arrow())} starting CONNECT proxy on 127.0.0.1:${plan.connectProxyPort} ${dim(`(log: ${plan.connectProxyLogPath})`)}`,
    );
  }
  return startDesktopConnectProxy({
    host: "127.0.0.1",
    port: plan.connectProxyPort,
    bridgeHost: "127.0.0.1",
    bridgePort: plan.bridgePort,
    logPath: plan.connectProxyLogPath,
  });
}

export function seedCursorAuthFromDefault(
  plan: Pick<
    CkLaunchPlan,
    "profileMode" | "userDataDir" | "seedAuthFromDefault"
  >,
): CursorAuthSeedStatus {
  if (!plan.seedAuthFromDefault) {
    return "not-requested";
  }
  if (plan.profileMode !== "isolated" || plan.userDataDir === undefined) {
    return "not-isolated";
  }
  if (spawnSync("sqlite3", ["--version"]).status !== 0) {
    return "sqlite-unavailable";
  }

  const sourceDb = path.join(
    DEFAULT_CURSOR_USER_DATA_DIR,
    "User",
    "globalStorage",
    "state.vscdb",
  );
  if (!fs.existsSync(sourceDb)) {
    return "source-missing";
  }
  const count = spawnSync(
    "sqlite3",
    [
      sourceDb,
      `select count(*) from ItemTable where key glob '${CURSOR_AUTH_KEY_PATTERN}';`,
    ],
    { encoding: "utf8" },
  );
  if (count.status !== 0 || Number(count.stdout.trim()) <= 0) {
    return "no-auth-rows";
  }

  const globalStorageDir = path.join(plan.userDataDir, "User", "globalStorage");
  fs.mkdirSync(globalStorageDir, { recursive: true });
  const targetDb = path.join(globalStorageDir, "state.vscdb");
  const optionsPath = path.join(globalStorageDir, "state.vscdb.options.json");
  if (!fs.existsSync(optionsPath)) {
    fs.writeFileSync(
      optionsPath,
      `${JSON.stringify({ useWAL: true }, null, 2)}\n`,
    );
  }

  const sourceSqlPath = sourceDb.replaceAll("'", "''");
  const seed = spawnSync(
    "sqlite3",
    [
      targetDb,
      [
        "CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);",
        `ATTACH '${sourceSqlPath}' AS source_db;`,
        `INSERT OR REPLACE INTO ItemTable(key, value) SELECT key, value FROM source_db.ItemTable WHERE key GLOB '${CURSOR_AUTH_KEY_PATTERN}';`,
        "DETACH source_db;",
      ].join(" "),
    ],
    { encoding: "utf8" },
  );
  return seed.status === 0 ? "seeded" : "sqlite-unavailable";
}

export function seedLocalModelsIntoCursorState(
  plan: Pick<
    CkLaunchPlan,
    "agentHttpPort" | "bridge" | "profileMode" | "userDataDir"
  >,
): CursorLocalModelSeedStatus {
  if (plan.profileMode !== "isolated" || plan.userDataDir === undefined) {
    return "not-isolated";
  }
  if (spawnSync("sqlite3", ["--version"]).status !== 0) {
    return "sqlite-unavailable";
  }
  const models = loadConfig(
    desktopEnv({ ...process.env, ...plan.bridge.env }),
  ).models;
  if (models.length === 0) {
    return "no-local-models";
  }
  const globalStorageDir = path.join(plan.userDataDir, "User", "globalStorage");
  const targetDb = path.join(globalStorageDir, "state.vscdb");
  if (!fs.existsSync(targetDb)) {
    return "state-missing";
  }
  const key =
    "src.vs.platform.reactivestorage.browser.reactiveStorageServiceImpl.persistentStorage.applicationUser";
  const applicationUserJson =
    readCursorStateValue(targetDb, key) ??
    readCursorStateValue(defaultCursorStateDbPath(), key);
  if (applicationUserJson === undefined) {
    return "state-missing";
  }

  const applicationUser = JSON.parse(applicationUserJson) as Record<
    string,
    unknown
  >;
  mergeLocalDesktopModelsIntoApplicationUser(applicationUser, models);
  const bridgeEnv = plan.bridge.env ?? {};
  const agentPublicOrigin =
    bridgeEnv.BRIDGE_AGENT_PUBLIC_ORIGIN ?? bridgeEnv.BRIDGE_PUBLIC_ORIGIN;
  if (typeof agentPublicOrigin === "string") {
    mergeLocalAgentBackendUrlsIntoApplicationUser(
      applicationUser,
      agentPublicOrigin,
    );
  }
  // The seed file mirrors the user's Cursor credentials (cursorCreds), so it is
  // written with owner-only permissions and removed once sqlite3 has imported
  // it rather than being left on disk.
  const seedPath = path.join(globalStorageDir, "applicationUser.seed.json");
  fs.writeFileSync(seedPath, JSON.stringify(applicationUser), { mode: 0o600 });
  try {
    const escapedSeedPath = seedPath.replaceAll("'", "''");
    const seed = spawnSync(
      "sqlite3",
      [
        targetDb,
        `insert or replace into ItemTable(key, value) values('${key}', cast(readfile('${escapedSeedPath}') as text));`,
      ],
      { encoding: "utf8" },
    );
    if (seed.status !== 0) {
      return "sqlite-unavailable";
    }
    return "seeded";
  } finally {
    fs.rmSync(seedPath, { force: true });
  }
}

function defaultCursorStateDbPath(): string {
  return path.join(
    DEFAULT_CURSOR_USER_DATA_DIR,
    "User",
    "globalStorage",
    "state.vscdb",
  );
}

function readCursorStateValue(dbPath: string, key: string): string | undefined {
  if (!fs.existsSync(dbPath)) {
    return undefined;
  }
  const escapedKey = key.replaceAll("'", "''");
  const result = spawnSync(
    "sqlite3",
    [dbPath, `select value from ItemTable where key='${escapedKey}';`],
    {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  if (result.status !== 0 || result.stdout.trim().length === 0) {
    return undefined;
  }
  return result.stdout;
}

export function cleanupIsolatedCursorProcesses(userDataDir: string): number[] {
  const killed = terminateIsolatedCursorProcesses(userDataDir, "SIGTERM");
  spawnSync("sleep", ["1"]);
  killed.push(...terminateIsolatedCursorProcesses(userDataDir, "SIGKILL"));
  return Array.from(new Set(killed));
}

function terminateIsolatedCursorProcesses(
  userDataDir: string,
  signal: NodeJS.Signals,
): number[] {
  const pids = isolatedCursorProcessIds(userDataDir);
  const killed: number[] = [];
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
      killed.push(pid);
    } catch {
      // The process may have exited between ps and kill.
    }
  }
  return killed;
}

function isolatedCursorProcessIds(userDataDir: string): number[] {
  const result = spawnSync("ps", ["-axo", "pid=,command="], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return [];
  }
  const pids: number[] = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/, 2);
    const pid = Number(parts[0]);
    if (!Number.isInteger(pid)) {
      continue;
    }
    const command = line.slice(line.indexOf(parts[1] ?? ""));
    if (
      command.includes("/Applications/Cursor.app/") &&
      cursorCommandUsesUserDataDir(command, userDataDir)
    ) {
      pids.push(pid);
    }
  }
  return pids;
}

function cursorCommandUsesUserDataDir(
  command: string,
  userDataDir: string,
): boolean {
  return (
    command.includes(`--user-data-dir=${userDataDir}`) ||
    command.includes(`--user-data-dir "${userDataDir}"`) ||
    command.includes(`--user-data-dir '${userDataDir}'`)
  );
}

function launchCursor(
  plan: CkLaunchPlan,
  options: { quiet?: boolean } = {},
): ChildProcess {
  const quiet = options.quiet ?? false;
  if (!quiet) {
    out(
      plan.profileMode === "isolated"
        ? `${cyan(glyph.arrow())} launching isolated Cursor instance`
        : `${cyan(glyph.arrow())} launching Cursor with the default signed-in profile`,
    );
    if (plan.profileMode === "default") {
      out(
        `${yellow(glyph.warn())} default profile mode reuses your existing Cursor auth state; it is less isolated but avoids browser login callback loss.`,
      );
    }
  }
  const cursor = spawn(plan.cursor.executable, plan.cursor.args, {
    env: { ...process.env, ...plan.cursor.env },
    stdio: "ignore",
  });
  cursor.on("error", (error) => {
    out(`${red(glyph.cross())} Cursor launch failed: ${error.message}`);
  });
  return cursor;
}

function attachBridgeOutput(
  bridge: ChildProcess,
  log: fs.WriteStream,
  mirror: boolean,
): void {
  bridge.stdout?.on("data", (chunk: Buffer) => {
    log.write(chunk);
    if (mirror) process.stdout.write(chunk);
  });
  bridge.stderr?.on("data", (chunk: Buffer) => {
    log.write(chunk);
    if (mirror) process.stderr.write(chunk);
  });
}

function writeLatestStatus(
  plan: CkLaunchPlan,
  report: DesktopTestReport,
): void {
  const state = fs.existsSync(plan.statePath)
    ? (JSON.parse(fs.readFileSync(plan.statePath, "utf8")) as Record<
        string,
        unknown
      >)
    : {};
  fs.writeFileSync(
    plan.statePath,
    JSON.stringify(
      {
        ...state,
        latestRouteInventoryStatus: {
          routeInventorySeen: report.routeInventorySeen,
          modelRoutesSeen: report.modelRoutesSeen,
          missingModelRoutes: report.missingModelRoutes,
          observedPaths: report.observedPaths,
          routeCategories: report.routeCategories,
          failedRoutes: report.failedRoutes,
          passThroughRoutes: report.passThroughRoutes,
          authSeedStatus: plan.authSeedStatus,
          localModelSeedStatus: plan.localModelSeedStatus,
          checkedAt: new Date().toISOString(),
        },
      },
      null,
      2,
    ),
  );
}

function printDesktopTestReport(
  plan: CkLaunchPlan,
  report: DesktopTestReport,
): void {
  const field = (label: string, value: string): void =>
    out(`${dim(`${label}:`)} ${value}`);
  out("");
  out(bold("Desktop Test Report"));
  field(
    "route inventory",
    report.routeInventorySeen ? green("yes") : yellow("no"),
  );
  field(
    "model routes seen",
    report.modelRoutesSeen.length > 0
      ? report.modelRoutesSeen.join(", ")
      : "none",
  );
  field(
    "model routes missing",
    report.missingModelRoutes.length > 0
      ? report.missingModelRoutes.join(", ")
      : "none",
  );
  field(
    "observed paths",
    report.observedPaths.length > 0 ? report.observedPaths.join(", ") : "none",
  );
  field(
    "failed routes",
    report.failedRoutes.length > 0
      ? red(String(report.failedRoutes.length))
      : String(report.failedRoutes.length),
  );
  field("pass-through routes", String(report.passThroughRoutes.length));
  field(
    "auth seed",
    `${plan.authSeedStatus ?? "not-run"}; local model seed: ${plan.localModelSeedStatus ?? "not-run"}`,
  );
  field(
    "route categories",
    report.routeCategories.length > 0
      ? report.routeCategories
          .map((entry) => `${entry.category}:${entry.path}`)
          .join(", ")
      : "none",
  );
  field("log", plan.logPath);
  field("state", plan.statePath);
  out(bold("diagnosis:"));
  for (const line of report.diagnosis) {
    out(`  ${cyan(glyph.bullet())} ${line}`);
  }
}

function bridgeCommandSpec(cwd: string): CommandSpec {
  const distCli = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "cli.js",
  );
  if (fs.existsSync(distCli)) {
    return { executable: process.execPath, args: [distCli, "desktop-proxy"] };
  }
  return {
    executable: "pnpm",
    args: ["exec", "tsx", "src/cli.ts", "desktop-proxy"],
    env: { PWD: cwd },
  };
}

function cursorCommandSpec(
  profileMode: CkProfileMode,
  userDataDir: string | undefined,
  extensionsDir: string,
  debugPort: number | undefined,
  workspacePath: string,
  bridgePort: number,
  allowInvalidLocalCert: boolean,
  connectProxyPort: number | undefined,
): CommandSpec {
  const userDataArgs =
    userDataDir === undefined ? [] : [`--user-data-dir=${userDataDir}`];
  const debugArgs =
    debugPort === undefined ? [] : [`--remote-debugging-port=${debugPort}`];
  const certificateArgs = allowInvalidLocalCert
    ? ["--ignore-certificate-errors"]
    : [];
  const hostResolverRules = DESKTOP_HOSTNAMES.map(
    (hostname) => `MAP ${hostname} 127.0.0.1:${bridgePort}`,
  ).join(", ");
  if (profileMode === "isolated") {
    const proxyEnv =
      connectProxyPort === undefined
        ? undefined
        : proxyEnvironment(`http://127.0.0.1:${connectProxyPort}`);
    const proxyArgs =
      connectProxyPort === undefined
        ? [`--host-resolver-rules=${hostResolverRules}`]
        : [
            `--proxy-server=http://127.0.0.1:${connectProxyPort}`,
            `--host-resolver-rules=${hostResolverRules}`,
            "--proxy-bypass-list=<-loopback>;localhost;127.0.0.1",
          ];
    return {
      executable: "/Applications/Cursor.app/Contents/MacOS/Cursor",
      args: [
        workspacePath,
        ...userDataArgs,
        `--extensions-dir=${extensionsDir}`,
        ...debugArgs,
        ...certificateArgs,
        ...proxyArgs,
      ],
      env: proxyEnv,
    };
  }
  return {
    executable: "/usr/bin/open",
    args: [
      "-n",
      "-a",
      "Cursor",
      workspacePath,
      "--args",
      ...userDataArgs,
      `--extensions-dir=${extensionsDir}`,
      ...debugArgs,
      ...certificateArgs,
      `--host-resolver-rules=${hostResolverRules}`,
    ],
  };
}

function proxyEnvironment(proxyUrl: string): Record<string, string> {
  return {
    HTTP_PROXY: proxyUrl,
    HTTPS_PROXY: proxyUrl,
    ALL_PROXY: proxyUrl,
    http_proxy: proxyUrl,
    https_proxy: proxyUrl,
    all_proxy: proxyUrl,
    NO_PROXY: "127.0.0.1,localhost,::1",
    no_proxy: "127.0.0.1,localhost,::1",
  };
}

function configureCursorNodeTlsEnv(plan: CkLaunchPlan): void {
  if (plan.profileMode !== "isolated") {
    return;
  }
  // Trust only the bridge's self-signed certificate via NODE_EXTRA_CA_CERTS
  // instead of globally disabling TLS verification. This keeps certificate
  // validation intact for real upstream traffic (e.g. api2.cursor.sh) while
  // allowing the spawned Cursor process to connect to the local bridge.
  const bridgeCertPath = plan.bridge.env?.BRIDGE_CERT_PATH ?? DESKTOP_CERT_PATH;
  plan.cursor.env = {
    ...plan.cursor.env,
    NODE_EXTRA_CA_CERTS: bridgeCertPath,
  };
}

function printPlan(plan: CkLaunchPlan): void {
  out(bold("Bridge:"));
  out(commandForDisplay(plan.bridge));
  out("");
  out(bold("Cursor:"));
  out(commandForDisplay(plan.cursor));
  out("");
  out(`${dim("State:")} ${plan.statePath}`);
  out(`${dim("Log:")} ${plan.logPath}`);
  if (plan.connectProxyPort !== undefined) {
    out(`${dim("CONNECT proxy:")} 127.0.0.1:${plan.connectProxyPort}`);
  }
  if (plan.agentHttpPort !== undefined) {
    out(`${dim("Agent HTTP bridge:")} 127.0.0.1:${plan.agentHttpPort}`);
  }
  if (plan.connectProxyLogPath !== undefined) {
    out(`${dim("CONNECT proxy log:")} ${plan.connectProxyLogPath}`);
  }
}

async function printCertInstructions(): Promise<void> {
  const cert = await withSpinner("generating desktop proxy certificate", () =>
    writeDesktopCertificate(),
  );
  out(`${dim("cert:")} ${cert.certPath}`);
  out(`${dim("key:")} ${cert.keyPath}`);
  printTrustInstructions(cert.certPath);
}

function printTrustInstructions(certPath: string): void {
  out(bold("Manual macOS trust command:"));
  out(desktopTrustCommand(certPath).map(shellQuote).join(" "));
}

async function printDoctor(): Promise<void> {
  const env = desktopEnv(process.env);
  const config = loadConfig(env);
  out(`\n${brandHeader("desktop launch readiness")}\n`);
  out(`${dim("desktop cert:")} ${desktopCertificateStatus(config)}`);
  out(`${dim("desktop dns:")} ${await desktopDnsStatus(config)}`);
  out(
    `${dim("upstream reachability:")} ${await upstreamReachabilityStatus(config)}`,
  );
  out(
    `${dim("local model backend:")} ${await localModelBackendStatus(config)}`,
  );
  if (!fs.existsSync(DESKTOP_CERT_PATH) || !fs.existsSync(DESKTOP_KEY_PATH)) {
    out(`${yellow(glyph.warn())} run ${bold("ck cert")} before launching.`);
  }
  out("");
  note("manual route plan: pnpm ck route");
}

async function printRoute(
  action: CkRouteAction,
  method: CkRouteMethod,
): Promise<void> {
  if (action === "status") {
    await printRouteStatus();
    return;
  }
  const plan = await buildCkRoutePlan({ method });
  if (action === "rollback") {
    printRouteRollback(plan);
    return;
  }
  printRoutePlan(plan);
}

function printRoutePlan(plan: CkRoutePlan): void {
  out(bold("Desktop Manual Routing Plan"));
  out(`${dim("method:")} ${plan.method}`);
  out(`${dim("primary hostname:")} ${plan.hostname}`);
  out(`${dim("hostnames:")} ${plan.hostnames.join(", ")}`);
  out(`${dim("bridge port:")} ${String(plan.bridgePort)}`);
  out(
    `${dim("upstream connect host:")} ${plan.upstreamConnectHost ?? "<set manually>"}`,
  );
  out("");
  if (plan.warnings.length > 0) {
    out(bold("Warnings:"));
    for (const warning of plan.warnings) {
      out(`${yellow(glyph.warn())} ${warning}`);
    }
    out("");
  }
  out(bold("Setup commands to run manually:"));
  for (const command of plan.setupCommands) {
    out(commandForDisplay(command));
  }
  out("");
  out(bold("Verification:"));
  for (const command of plan.verificationCommands) {
    out(commandForDisplay(command));
  }
  out("");
  out(bold("Rollback:"));
  for (const command of plan.rollbackCommands) {
    out(commandForDisplay(command));
  }
  out("");
  note(
    "ck prints these commands only. It does not install trust, edit hosts, configure pf, or kill Cursor for you.",
  );
}

async function printRouteStatus(): Promise<void> {
  const env = desktopEnv(process.env);
  const config = loadConfig(env);
  out(bold("Desktop Routing Status"));
  out(`${dim("desktop cert:")} ${desktopCertificateStatus(config)}`);
  out(`${dim("desktop dns:")} ${await desktopDnsStatus(config)}`);
  for (const hostname of DESKTOP_HOSTNAMES.filter(
    (hostname) => hostname !== DESKTOP_HOSTNAME,
  )) {
    out(
      `${dim("desktop dns:")} ${await desktopDnsStatusForHostname(hostname)}`,
    );
  }
  out(
    `${dim("detected upstream connect host:")} ${(await detectUpstreamConnectHost()) ?? "<none; set CURSOR_UPSTREAM_CONNECT_HOST manually>"}`,
  );
  out(
    `${dim("configured upstream connect:")} ${
      config.upstreamConnectHost === undefined
        ? "system DNS"
        : `${config.upstreamConnectHost}${config.upstreamConnectPort === undefined ? "" : `:${config.upstreamConnectPort}`}`
    }`,
  );
  out(
    `${dim("upstream reachability:")} ${await upstreamReachabilityStatus(config)}`,
  );
  out(
    `${dim("local model backend:")} ${await localModelBackendStatus(config)}`,
  );
  out("");
  out(bold("Next steps:"));
  note(
    "Run `pnpm ck route` before system cutover to capture a real upstream IP.",
  );
  note("Run `pnpm ck route rollback` to print the rollback commands.");
}

function printRouteRollback(plan: CkRoutePlan): void {
  out(bold("Desktop Routing Rollback"));
  for (const command of plan.rollbackCommands) {
    out(commandForDisplay(command));
  }
  out("");
  note(
    "ck prints rollback commands only. Review them before running; especially `pkill -x Cursor`.",
  );
}

async function stopBridgeFromState(): Promise<void> {
  if (!fs.existsSync(CK_STATE_PATH)) {
    out(`${gray(glyph.bullet())} No ck state file found.`);
    return;
  }
  const state = JSON.parse(fs.readFileSync(CK_STATE_PATH, "utf8")) as CkState;
  if (state.bridgePid === undefined) {
    out(`${gray(glyph.bullet())} No bridge PID recorded.`);
    return;
  }
  const command = processCommandForPid(state.bridgePid);
  if (command === undefined) {
    out(
      `${yellow(glyph.warn())} No running process found for ck bridge PID ${state.bridgePid}.`,
    );
    return;
  }
  if (!bridgeProcessMatchesState(command, state)) {
    out(
      `${yellow(glyph.warn())} Refusing to stop PID ${state.bridgePid}; it does not look like the ck-owned desktop bridge recorded in state.`,
    );
    return;
  }
  try {
    process.kill(state.bridgePid, "SIGTERM");
    out(`${green(glyph.tick())} Stopped ck bridge process ${state.bridgePid}.`);
  } catch (error) {
    out(
      `${yellow(glyph.warn())} Could not stop bridge process ${state.bridgePid}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export function bridgeProcessMatchesState(
  command: string,
  state: Pick<CkState, "bridgeCommand"> = {},
): boolean {
  const normalizedCommand = command.replace(/\s+/g, " ").trim();
  const normalizedStateCommand = state.bridgeCommand
    ?.replace(/\s+/g, " ")
    .trim();
  if (
    normalizedStateCommand !== undefined &&
    normalizedStateCommand.length > 0 &&
    normalizedCommand.includes(normalizedStateCommand)
  ) {
    return true;
  }
  return (
    /\bdesktop-proxy\b/.test(normalizedCommand) &&
    (normalizedCommand.includes("src/cli.ts") ||
      normalizedCommand.includes("dist/src/cli.js") ||
      normalizedCommand.includes("/cli.js") ||
      normalizedCommand.includes("cursorkit") ||
      normalizedCommand.includes("cursor-rpc"))
  );
}

function processCommandForPid(pid: number): string | undefined {
  const result = spawnSync("ps", ["-p", String(pid), "-o", "command="], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    return undefined;
  }
  const command = result.stdout.trim();
  return command.length === 0 ? undefined : command;
}

function writeState(plan: CkLaunchPlan, bridge: ChildProcess): void {
  fs.writeFileSync(
    plan.statePath,
    JSON.stringify(
      {
        bridgePid: bridge.pid,
        bridgeCommand: commandForDisplay(plan.bridge),
        bridgePort: plan.bridgePort,
        connectProxyPort: plan.connectProxyPort,
        agentHttpPort: plan.agentHttpPort,
        logPath: plan.logPath,
        connectProxyLogPath: plan.connectProxyLogPath,
        profileMode: plan.profileMode,
        userDataDir: plan.userDataDir,
        extensionsDir: plan.extensionsDir,
        workspacePath: plan.workspacePath,
        debugPort: plan.debugPort,
        instanceId: plan.instanceId,
        seedAuthFromDefault: plan.seedAuthFromDefault,
        authSeedStatus: plan.authSeedStatus,
        localModelSeedStatus: plan.localModelSeedStatus,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

async function waitForBridgeListening(bridge: ChildProcess): Promise<void> {
  await waitForOutput(bridge, /bridge listening/, 10_000);
}

async function waitForRouteInventory(
  bridge: ChildProcess,
  timeoutMs: number,
): Promise<boolean> {
  return waitForOutput(bridge, /desktop route inventory/, timeoutMs)
    .then(() => true)
    .catch(() => false);
}

function waitForOutput(
  process: ChildProcess,
  pattern: RegExp,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish(false), timeoutMs);
    const onData = (chunk: Buffer) => {
      if (pattern.test(chunk.toString("utf8"))) {
        finish(true);
      }
    };
    const onExit = () => finish(false);
    const finish = (matched: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      process.stdout?.off("data", onData);
      process.stderr?.off("data", onData);
      process.off("exit", onExit);
      if (matched) {
        resolve();
      } else {
        reject(new Error(`Timed out waiting for ${pattern.source}`));
      }
    };
    process.stdout?.on("data", onData);
    process.stderr?.on("data", onData);
    process.on("exit", onExit);
  });
}

function assertSafe(spec: CommandSpec): void {
  if (containsPrivilegedCommand(spec)) {
    throw new Error(`Refusing privileged command: ${commandForDisplay(spec)}`);
  }
}

async function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

function stringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function pickDisplayableBridgeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const keys = [
    "BRIDGE_HARDCODED_RESPONSE",
    "BRIDGE_LOG_MODEL_PAYLOADS",
    "BRIDGE_MODELS_JSON",
    "BRIDGE_DESKTOP_MODE",
    "BRIDGE_USE_TLS",
    "BRIDGE_TLS_HOSTNAMES",
    "BRIDGE_PUBLIC_ORIGIN",
    "CURSOR_UPSTREAM_BASE_URL",
    "CURSOR_UPSTREAM_CONNECT_HOST",
    "CURSOR_UPSTREAM_CONNECT_PORT",
    "MODEL_API_KEY",
    "MODEL_CONTEXT_TOKEN_LIMIT",
    "MODEL_NAME",
    "MODEL_PROVIDER_MODEL",
    "MODEL_BASE_URL",
  ];
  const result: NodeJS.ProcessEnv = {};
  for (const key of keys) {
    if (env[key] !== undefined) {
      result[key] = env[key];
    }
  }
  return result;
}

function displayEnvValue(key: string, value: string): string {
  if (key.includes("API_KEY") || key === "BRIDGE_MODELS_JSON") {
    return "<redacted>";
  }
  return value;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) =>
    left.localeCompare(right),
  );
}

function uniqueSortedNumbers(values: number[]): number[] {
  return Array.from(new Set(values)).sort((left, right) => left - right);
}

async function detectUpstreamConnectHost(): Promise<string | undefined> {
  try {
    const result = await lookup(DESKTOP_HOSTNAME);
    if (result.address === "127.0.0.1" || result.address === "::1") {
      return undefined;
    }
    return result.address;
  } catch {
    return undefined;
  }
}

async function desktopDnsStatusForHostname(hostname: string): Promise<string> {
  try {
    const result = await lookup(hostname);
    return `${hostname} -> ${result.address}`;
  } catch (error) {
    return `${hostname} -> lookup failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberField(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

async function delay(timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=,-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
