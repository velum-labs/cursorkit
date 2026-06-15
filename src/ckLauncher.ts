import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { lookup } from "node:dns/promises";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig, type LocalModelConfig } from "./config.js";
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

export type CkCommand =
  | "launch"
  | "test"
  | "doctor"
  | "cert"
  | "route"
  | "stop"
  | "help";
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

const CK_HELP = `ck

Usage:
  ck                         Start desktop proxy and isolated Cursor
  ck test                    Launch, monitor route inventory, print diagnosis, then stop bridge
  ck --use-default-profile   Reuse your logged-in Cursor profile for auth-sensitive testing
  ck --timeout-ms 30000      Set launch/test route-inventory wait time
  ck --debug-port 9333       Launch Cursor with a Chromium remote debugging port
  ck --instance-id name      Use a fresh isolated ck state/profile subdirectory
  ck --seed-auth-from-default Copy Cursor auth rows from your default profile
  ck --no-seed-auth-from-default Start isolated Cursor without copying auth rows
  ck --print                 Print commands without launching
  ck doctor                  Check desktop launch readiness
  ck cert                    Generate desktop proxy certificate
  ck route                   Print manual desktop routing setup and rollback commands
  ck route status            Check desktop routing prerequisites and current DNS state
  ck route rollback          Print rollback commands only
  ck route --method direct   Print direct :443 routing commands instead of pf redirect
  ck stop                    Stop ck-owned bridge process
  ck --help                  Show this help
`;

export function parseCkArgs(argv: string[]): CkArgs {
  const args = argv.slice(2);
  let dryRun = false;
  let profileMode: CkProfileMode = "isolated";
  let routeMethod: CkRouteMethod = "pf";
  let routeAction: CkRouteAction = "plan";
  let debugPort: number | undefined;
  let instanceId: string | undefined;
  let seedAuthFromDefault: boolean | undefined;
  let timeoutMs = DEFAULT_ROUTE_INVENTORY_TIMEOUT_MS;
  const commandArgs: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--print") {
      dryRun = true;
    } else if (arg === "--use-default-profile") {
      profileMode = "default";
    } else if (arg === "--profile") {
      const next = args[index + 1];
      if (next !== "isolated" && next !== "default") {
        throw new Error("--profile must be isolated or default");
      }
      profileMode = next;
      index += 1;
    } else if (arg === "--timeout-ms") {
      const next = args[index + 1];
      const parsed = Number(next);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error("--timeout-ms must be a positive integer");
      }
      timeoutMs = parsed;
      index += 1;
    } else if (arg === "--method") {
      const next = args[index + 1];
      if (next !== "pf" && next !== "direct") {
        throw new Error("--method must be pf or direct");
      }
      routeMethod = next;
      index += 1;
    } else if (arg === "--debug-port") {
      const next = args[index + 1];
      const parsed = Number(next);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error("--debug-port must be a positive integer");
      }
      debugPort = parsed;
      index += 1;
    } else if (arg === "--instance-id") {
      const next = args[index + 1];
      if (next === undefined || !/^[A-Za-z0-9._-]+$/.test(next)) {
        throw new Error(
          "--instance-id must use only letters, numbers, dot, underscore, or dash",
        );
      }
      instanceId = next;
      index += 1;
    } else if (arg === "--seed-auth-from-default") {
      seedAuthFromDefault = true;
    } else if (arg === "--no-seed-auth-from-default") {
      seedAuthFromDefault = false;
    } else if (arg !== undefined) {
      commandArgs.push(arg);
    }
  }
  const first = commandArgs[0];
  const second = commandArgs[1];
  if (first === "route") {
    if (second === undefined) {
      routeAction = "plan";
    } else if (second === "status" || second === "rollback") {
      routeAction = second;
    } else {
      throw new Error("ck route subcommand must be status or rollback");
    }
  }
  if (first === undefined) {
    return compactCkArgs({
      command: "launch",
      dryRun,
      profileMode,
      timeoutMs,
      routeMethod,
      routeAction,
      debugPort,
      instanceId,
      seedAuthFromDefault,
    });
  }
  switch (first) {
    case "test":
    case "doctor":
    case "cert":
    case "route":
    case "stop":
      return compactCkArgs({
        command: first,
        dryRun,
        profileMode,
        timeoutMs,
        routeMethod,
        routeAction,
        debugPort,
        instanceId,
        seedAuthFromDefault,
      });
    case "help":
    case "--help":
    case "-h":
      return compactCkArgs({
        command: "help",
        dryRun,
        profileMode,
        timeoutMs,
        routeMethod,
        routeAction,
        debugPort,
        instanceId,
        seedAuthFromDefault,
      });
    default:
      throw new Error(`Unknown ck command: ${first}\n\n${CK_HELP}`);
  }
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
}): CkLaunchPlan {
  const cwd = options.cwd ?? process.cwd();
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
      cwd,
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
    workspacePath: cwd,
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
  const parsed = parseCkArgs(argv);
  if (parsed.command === "help") {
    console.log(CK_HELP);
    return;
  }
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
  const plan = buildCkLaunchPlan({
    env: process.env,
    bridgePort,
    connectProxyPort,
    agentHttpPort,
    profileMode: parsed.profileMode,
    debugPort: parsed.debugPort,
    instanceId: parsed.instanceId,
    seedAuthFromDefault: parsed.seedAuthFromDefault,
  });

  if (parsed.dryRun) {
    printPlan(plan);
    return;
  }

  const cert = await writeDesktopCertificate();
  if (cert.created) {
    console.warn("Generated desktop proxy certificate.");
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

async function launch(plan: CkLaunchPlan, timeoutMs: number): Promise<void> {
  const { bridge, log, connectProxy } = await startBridge(plan);
  const routeSeen = waitForRouteInventory(bridge, timeoutMs);

  launchCursor(plan);

  const observed = await routeSeen;
  if (observed) {
    console.log("Desktop route inventory observed.");
  } else {
    for (const line of routeInventoryTimeoutDiagnosis()) {
      console.warn(line);
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
  const { bridge, log, connectProxy } = await startBridge(plan);
  try {
    launchCursor(plan);
    console.log(`Monitoring desktop route inventory for ${timeoutMs}ms`);
    await delay(timeoutMs);

    const logText = fs.existsSync(plan.logPath)
      ? fs.readFileSync(plan.logPath, "utf8")
      : "";
    const report = analyzeRouteInventoryLog(logText);
    writeLatestStatus(plan, report);
    printDesktopTestReport(plan, report);
  } finally {
    bridge.kill("SIGTERM");
    await connectProxy?.close();
    log.end();
    if (plan.userDataDir !== undefined) {
      cleanupIsolatedCursorProcesses(plan.userDataDir);
    }
  }
}

async function startBridge(plan: CkLaunchPlan): Promise<CkProcessGroup> {
  fs.mkdirSync(plan.stateDir, { recursive: true });
  if (plan.userDataDir !== undefined) {
    fs.mkdirSync(plan.userDataDir, { recursive: true });
  }
  fs.mkdirSync(plan.extensionsDir, { recursive: true });
  plan.authSeedStatus = seedCursorAuthFromDefault(plan);
  if (plan.authSeedStatus === "seeded") {
    console.log("Seeded isolated Cursor profile with default auth rows");
  } else if (
    plan.seedAuthFromDefault &&
    plan.authSeedStatus !== "not-isolated"
  ) {
    console.warn(`Cursor auth seeding status: ${plan.authSeedStatus}`);
  }
  plan.localModelSeedStatus = seedLocalModelsIntoCursorState(plan);
  if (plan.localModelSeedStatus === "seeded") {
    console.log("Seeded isolated Cursor profile with local model entries");
  } else if (plan.localModelSeedStatus !== "not-isolated") {
    console.warn(
      `Cursor local model seeding status: ${plan.localModelSeedStatus}`,
    );
  }
  configureCursorNodeTlsEnv(plan);

  assertSafe(plan.bridge);
  assertSafe(plan.cursor);

  console.log(`Starting bridge on 127.0.0.1:${plan.bridgePort}`);
  console.log(`Writing bridge log to ${plan.logPath}`);
  const log = fs.createWriteStream(plan.logPath, { flags: "w" });
  const bridge = spawn(plan.bridge.executable, plan.bridge.args, {
    env: { ...process.env, ...plan.bridge.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  attachBridgeOutput(bridge, log);
  writeState(plan, bridge);
  await waitForBridgeListening(bridge);
  const connectProxy = await startConnectProxy(plan);
  return {
    bridge,
    log,
    ...(connectProxy === undefined ? {} : { connectProxy }),
  };
}

async function startConnectProxy(
  plan: CkLaunchPlan,
): Promise<DesktopConnectProxy | undefined> {
  if (
    plan.connectProxyPort === undefined ||
    plan.connectProxyLogPath === undefined
  ) {
    return undefined;
  }
  fs.writeFileSync(plan.connectProxyLogPath, "");
  console.log(`Starting CONNECT proxy on 127.0.0.1:${plan.connectProxyPort}`);
  console.log(`Writing CONNECT proxy log to ${plan.connectProxyLogPath}`);
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
  const seedPath = path.join(globalStorageDir, "applicationUser.seed.json");
  fs.writeFileSync(seedPath, JSON.stringify(applicationUser));
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
}

export function mergeLocalAgentBackendUrlsIntoApplicationUser(
  applicationUser: Record<string, unknown>,
  agentOrigin: string,
): void {
  const cursorCreds = ensureRecord(applicationUser, "cursorCreds");
  const urls = { default: agentOrigin };
  cursorCreds.agentBackendUrlPrivacy = urls;
  cursorCreds.agentBackendUrlNonPrivacy = urls;
}

export function mergeLocalDesktopModelsIntoApplicationUser(
  applicationUser: Record<string, unknown>,
  models: LocalModelConfig[],
): void {
  const localModelIds = new Set(models.map((model) => model.id));
  const current = Array.isArray(applicationUser.availableDefaultModels2)
    ? applicationUser.availableDefaultModels2.filter((item) => {
        if (!isPlainRecord(item) || typeof item.name !== "string") {
          return true;
        }
        return !localModelIds.has(item.name);
      })
    : [];
  applicationUser.availableDefaultModels2 = current;

  const aiSettings = ensureRecord(applicationUser, "aiSettings");
  for (const model of models) {
    appendUnique(ensureStringArray(aiSettings, "userAddedModels"), model.id);
    appendUnique(
      ensureStringArray(aiSettings, "modelOverrideEnabled"),
      model.id,
    );
    removeValue(
      ensureStringArray(aiSettings, "modelOverrideDisabled"),
      model.id,
    );
  }
  const preferences = ensureRecord(aiSettings, "modelParameterPreferences");
  const updatedAt = new Date().toISOString();
  for (const model of models) {
    preferences[model.id] = {
      modelId: model.id,
      parameters: localDesktopParameterValues(true),
      updatedAt,
    };
  }
  const firstModel = models[0];
  if (firstModel !== undefined) {
    applicationUser.useOpenAIKey = true;
    applicationUser.openAIBaseUrl = firstModel.baseUrl;
    applicationUser.openAIKey = firstModel.apiKey;
    const modelConfig = ensureRecord(aiSettings, "modelConfig");
    const selectedModel = {
      modelId: firstModel.id,
      parameters: localDesktopParameterValues(true),
    };
    for (const key of ["composer", "background-composer"]) {
      modelConfig[key] = {
        modelName: firstModel.id,
        maxMode: true,
        selectedModels: [selectedModel],
      };
    }
  }

  const featureModelConfigs = ensureRecord(
    applicationUser,
    "featureModelConfigs",
  );
  for (const value of Object.values(featureModelConfigs)) {
    if (!isPlainRecord(value)) {
      continue;
    }
    const fallbackModels = ensureStringArray(value, "fallbackModels");
    for (const model of models) {
      appendUnique(fallbackModels, model.id);
    }
  }
}

function ensureRecord(
  target: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  if (!isPlainRecord(target[key])) {
    target[key] = {};
  }
  return target[key] as Record<string, unknown>;
}

function ensureStringArray(
  target: Record<string, unknown>,
  key: string,
): string[] {
  const values = Array.isArray(target[key])
    ? target[key].filter((value): value is string => typeof value === "string")
    : [];
  target[key] = values;
  return values;
}

function appendUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function removeValue(values: string[], value: string): void {
  const index = values.indexOf(value);
  if (index !== -1) {
    values.splice(index, 1);
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

export function buildLocalDesktopModelEntry(
  model: LocalModelConfig,
): Record<string, unknown> {
  const tooltipData = {
    primaryText: "",
    secondaryText: "",
    secondaryWarningText: false,
    icon: "",
    tertiaryText: "",
    tertiaryTextUrl: "",
    markdownContent: `**${model.displayName}**<br />Local OpenAI-compatible model served by cursor-rpc.<br /><br />${model.contextTokenLimit.toLocaleString()} token context window`,
  };
  return {
    name: model.id,
    serverModelName: model.id,
    clientDisplayName: model.displayName,
    inputboxShortModelName: model.displayName,
    vendorName: "local",
    vendor: { displayName: "Local" },
    supportsAgent: true,
    supportsCmdK: false,
    supportsImages: false,
    supportsMaxMode: true,
    supportsNonMaxMode: true,
    supportsPlanMode: true,
    supportsSandboxing: false,
    supportsThinking: false,
    cloudAgentEffortModes: [],
    defaultOn: true,
    degradationStatus: 0,
    isRecommendedForBackgroundComposer: false,
    legacySlugs: [model.id],
    idAliases: [model.id, model.displayName],
    parameterDefinitions: localDesktopParameterDefinitions(),
    namedModelSectionIndex: 10_000,
    visibleInRoutedModelView: true,
    tooltipData,
    tooltipDataForMaxMode: tooltipData,
    variants: [
      localDesktopVariantConfig(model, tooltipData, false),
      localDesktopVariantConfig(model, tooltipData, true),
    ],
  };
}

function localDesktopVariantConfig(
  model: LocalModelConfig,
  tooltipData: Record<string, unknown>,
  isMaxMode: boolean,
): Record<string, unknown> {
  return {
    parameterValues: localDesktopParameterValues(isMaxMode),
    displayName: model.displayName,
    isMaxMode,
    isDefaultMaxConfig: isMaxMode,
    isDefaultNonMaxConfig: !isMaxMode,
    tooltipData,
    displayNameOutsidePicker: model.displayName,
    variantStringRepresentation: localDesktopVariantString(model.id, isMaxMode),
    legacySlug: model.id,
  };
}

function localDesktopVariantString(
  modelId: string,
  isMaxMode: boolean,
): string {
  const context = isMaxMode ? "1m" : "272k";
  return `${modelId}[context=${context},reasoning=medium,fast=false]`;
}

function localDesktopParameterValues(
  isMaxMode: boolean,
): Array<Record<string, string>> {
  return [
    { id: "context", value: isMaxMode ? "1m" : "272k" },
    { id: "reasoning", value: "medium" },
    { id: "fast", value: "false" },
  ];
}

function localDesktopParameterDefinitions(): Array<Record<string, unknown>> {
  return [
    {
      id: "context",
      name: "Context",
      markdownTooltip: "Context size the model has available.",
      parameterType: {
        enumParameter: {
          values: [
            { value: "272k", displayName: "272K" },
            { value: "1m", displayName: "1M" },
          ],
        },
      },
    },
    {
      id: "reasoning",
      name: "Reasoning",
      markdownTooltip:
        "Reasoning effort the model uses to generate its response.",
      parameterType: {
        enumParameter: {
          values: [
            { value: "none", displayName: "None" },
            { value: "low", displayName: "Low" },
            { value: "medium", displayName: "Medium" },
            { value: "high", displayName: "High" },
            { value: "extra-high", displayName: "Extra High" },
          ],
        },
      },
      isCycleableByHotkey: true,
    },
    {
      id: "fast",
      name: "Fast",
      markdownTooltip: "Use the provider's fast lane when supported.",
      parameterType: {
        booleanParameter: {
          values: [{ value: "false" }, { value: "true", displayName: "Fast" }],
        },
      },
    },
  ];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function launchCursor(plan: CkLaunchPlan): ChildProcess {
  console.log(
    plan.profileMode === "isolated"
      ? "Launching isolated Cursor instance"
      : "Launching Cursor with the default signed-in profile",
  );
  if (plan.profileMode === "default") {
    console.warn(
      "Default profile mode reuses your existing Cursor auth state; it is less isolated but avoids browser login callback loss.",
    );
  }
  const cursor = spawn(plan.cursor.executable, plan.cursor.args, {
    env: { ...process.env, ...plan.cursor.env },
    stdio: "ignore",
  });
  cursor.on("error", (error) => {
    console.error(`Cursor launch failed: ${error.message}`);
  });
  return cursor;
}

function attachBridgeOutput(bridge: ChildProcess, log: fs.WriteStream): void {
  bridge.stdout?.on("data", (chunk: Buffer) => {
    log.write(chunk);
    process.stdout.write(chunk);
  });
  bridge.stderr?.on("data", (chunk: Buffer) => {
    log.write(chunk);
    process.stderr.write(chunk);
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
  console.log("");
  console.log("Desktop Test Report");
  console.log(`route inventory: ${report.routeInventorySeen ? "yes" : "no"}`);
  console.log(
    `model routes seen: ${
      report.modelRoutesSeen.length > 0
        ? report.modelRoutesSeen.join(", ")
        : "none"
    }`,
  );
  console.log(
    `model routes missing: ${
      report.missingModelRoutes.length > 0
        ? report.missingModelRoutes.join(", ")
        : "none"
    }`,
  );
  console.log(
    `observed paths: ${
      report.observedPaths.length > 0 ? report.observedPaths.join(", ") : "none"
    }`,
  );
  console.log(`failed routes: ${String(report.failedRoutes.length)}`);
  console.log(
    `pass-through routes: ${String(report.passThroughRoutes.length)}`,
  );
  console.log(
    `auth seed: ${plan.authSeedStatus ?? "not-run"}; local model seed: ${
      plan.localModelSeedStatus ?? "not-run"
    }`,
  );
  console.log(
    `route categories: ${
      report.routeCategories.length > 0
        ? report.routeCategories
            .map((entry) => `${entry.category}:${entry.path}`)
            .join(", ")
        : "none"
    }`,
  );
  console.log(`log: ${plan.logPath}`);
  console.log(`state: ${plan.statePath}`);
  console.log("diagnosis:");
  for (const line of report.diagnosis) {
    console.log(`- ${line}`);
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
  plan.cursor.env = {
    ...plan.cursor.env,
    NODE_TLS_REJECT_UNAUTHORIZED: "0",
  };
}

function printPlan(plan: CkLaunchPlan): void {
  console.log("Bridge:");
  console.log(commandForDisplay(plan.bridge));
  console.log("");
  console.log("Cursor:");
  console.log(commandForDisplay(plan.cursor));
  console.log("");
  console.log(`State: ${plan.statePath}`);
  console.log(`Log: ${plan.logPath}`);
  if (plan.connectProxyPort !== undefined) {
    console.log(`CONNECT proxy: 127.0.0.1:${plan.connectProxyPort}`);
  }
  if (plan.agentHttpPort !== undefined) {
    console.log(`Agent HTTP bridge: 127.0.0.1:${plan.agentHttpPort}`);
  }
  if (plan.connectProxyLogPath !== undefined) {
    console.log(`CONNECT proxy log: ${plan.connectProxyLogPath}`);
  }
}

async function printCertInstructions(): Promise<void> {
  const cert = await writeDesktopCertificate();
  console.log(`cert: ${cert.certPath}`);
  console.log(`key: ${cert.keyPath}`);
  printTrustInstructions(cert.certPath);
}

function printTrustInstructions(certPath: string): void {
  console.log("Manual macOS trust command:");
  console.log(desktopTrustCommand(certPath).map(shellQuote).join(" "));
}

async function printDoctor(): Promise<void> {
  const env = desktopEnv(process.env);
  const config = loadConfig(env);
  console.log(`desktop cert: ${desktopCertificateStatus(config)}`);
  console.log(`desktop dns: ${await desktopDnsStatus(config)}`);
  console.log(
    `upstream reachability: ${await upstreamReachabilityStatus(config)}`,
  );
  console.log(`local model backend: ${await localModelBackendStatus(config)}`);
  if (!fs.existsSync(DESKTOP_CERT_PATH) || !fs.existsSync(DESKTOP_KEY_PATH)) {
    console.warn("Run ck cert before launching.");
  }
  console.log("");
  console.log("manual route plan: pnpm ck route");
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
  console.log("Desktop Manual Routing Plan");
  console.log(`method: ${plan.method}`);
  console.log(`primary hostname: ${plan.hostname}`);
  console.log(`hostnames: ${plan.hostnames.join(", ")}`);
  console.log(`bridge port: ${String(plan.bridgePort)}`);
  console.log(
    `upstream connect host: ${plan.upstreamConnectHost ?? "<set manually>"}`,
  );
  console.log("");
  if (plan.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of plan.warnings) {
      console.log(`- ${warning}`);
    }
    console.log("");
  }
  console.log("Setup commands to run manually:");
  for (const command of plan.setupCommands) {
    console.log(commandForDisplay(command));
  }
  console.log("");
  console.log("Verification:");
  for (const command of plan.verificationCommands) {
    console.log(commandForDisplay(command));
  }
  console.log("");
  console.log("Rollback:");
  for (const command of plan.rollbackCommands) {
    console.log(commandForDisplay(command));
  }
  console.log("");
  console.log(
    "ck prints these commands only. It does not install trust, edit hosts, configure pf, or kill Cursor for you.",
  );
}

async function printRouteStatus(): Promise<void> {
  const env = desktopEnv(process.env);
  const config = loadConfig(env);
  console.log("Desktop Routing Status");
  console.log(`desktop cert: ${desktopCertificateStatus(config)}`);
  console.log(`desktop dns: ${await desktopDnsStatus(config)}`);
  for (const hostname of DESKTOP_HOSTNAMES.filter(
    (hostname) => hostname !== DESKTOP_HOSTNAME,
  )) {
    console.log(`desktop dns: ${await desktopDnsStatusForHostname(hostname)}`);
  }
  console.log(
    `detected upstream connect host: ${(await detectUpstreamConnectHost()) ?? "<none; set CURSOR_UPSTREAM_CONNECT_HOST manually>"}`,
  );
  console.log(
    `configured upstream connect: ${
      config.upstreamConnectHost === undefined
        ? "system DNS"
        : `${config.upstreamConnectHost}${config.upstreamConnectPort === undefined ? "" : `:${config.upstreamConnectPort}`}`
    }`,
  );
  console.log(
    `upstream reachability: ${await upstreamReachabilityStatus(config)}`,
  );
  console.log(`local model backend: ${await localModelBackendStatus(config)}`);
  console.log("");
  console.log("Next steps:");
  console.log(
    "- Run `pnpm ck route` before system cutover to capture a real upstream IP.",
  );
  console.log("- Run `pnpm ck route rollback` to print the rollback commands.");
}

function printRouteRollback(plan: CkRoutePlan): void {
  console.log("Desktop Routing Rollback");
  for (const command of plan.rollbackCommands) {
    console.log(commandForDisplay(command));
  }
  console.log("");
  console.log(
    "ck prints rollback commands only. Review them before running; especially `pkill -x Cursor`.",
  );
}

async function stopBridgeFromState(): Promise<void> {
  if (!fs.existsSync(CK_STATE_PATH)) {
    console.log("No ck state file found.");
    return;
  }
  const state = JSON.parse(fs.readFileSync(CK_STATE_PATH, "utf8")) as CkState;
  if (state.bridgePid === undefined) {
    console.log("No bridge PID recorded.");
    return;
  }
  const command = processCommandForPid(state.bridgePid);
  if (command === undefined) {
    console.warn(
      `No running process found for ck bridge PID ${state.bridgePid}.`,
    );
    return;
  }
  if (!bridgeProcessMatchesState(command, state)) {
    console.warn(
      `Refusing to stop PID ${state.bridgePid}; it does not look like the ck-owned desktop bridge recorded in state.`,
    );
    return;
  }
  try {
    process.kill(state.bridgePid, "SIGTERM");
    console.log(`Stopped ck bridge process ${state.bridgePid}.`);
  } catch (error) {
    console.warn(
      `Could not stop bridge process ${state.bridgePid}: ${
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
