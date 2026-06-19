import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import readline from "node:readline";

import { WebSocket } from "undici";

import {
  analyzeRouteInventoryLog,
  cleanupIsolatedCursorProcesses,
  seedLocalModelsIntoCursorState,
} from "../ckLauncher.js";
import {
  AGENT_RUN_PATH,
  AGENT_RUN_SSE_PATH,
  BIDI_APPEND_PATH,
  STREAM_CHAT_WITH_TOOLS_PATH,
} from "../routes.js";
import { probeLocalBackend } from "./localBackend.js";
import type {
  FailureCode,
  HarnessOptions,
  ProcessRunResult,
  Scenario,
  ScenarioContext,
  ScenarioResult,
} from "./types.js";

interface TrafficProcessSummary {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  durationMs: number;
  logPath: string;
  stdoutPreview: string;
  stderrPreview: string;
}

interface ScriptedToolBackend {
  server: http.Server;
  baseUrl: string;
  requests: ScriptedToolBackendRequest[];
}

interface ScriptedToolBackendRequest {
  messageRoles: string[];
  toolNames: string[];
  assistantToolCallNames: string[];
  lastMessageRole: string | undefined;
  lastMessagePreview: string | undefined;
}

interface AcpMessage {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

interface AcpProbeReport {
  endpoint: string;
  initialized: boolean;
  authenticated: boolean;
  sessionCreated: boolean;
  promptCompleted: boolean;
  textPreview: string;
  routeInventory: ReturnType<typeof analyzeRouteInventoryLog>;
  agentRunDiagnostics: AgentRunDiagnosticSummary[];
  events: Array<Record<string, unknown>>;
}

interface AgentRunDiagnosticSummary {
  modelId: string;
  promptLength: number;
  customSystemPromptLength: number;
  promptContextNodes: number;
  inlinePromptContextNodes: number;
  inlinePromptContextCharacters: number;
  mcpToolCount: number;
  mcpToolNames: string[];
  hasMcpFileSystemOptions: boolean;
  hasSkillOptions: boolean;
  excludeWorkspaceContext: boolean;
  preFetchedBlobCount: number;
  injectedContextMessages: number;
}

interface DesktopPromptSubmissionEvidence {
  promptPreview: string;
  focused: boolean;
  inserted: boolean;
  sendAttempted: boolean;
  submitted: boolean;
  focusTarget?: string;
  sendClickStatus?: string;
  failureReason?: string;
  editorSummary?: string;
  placeholderSummary?: string;
  composerHtml?: string;
  controlSummary?: string;
  editorTextAfterInsert?: string;
  editorTextAfterSubmit?: string;
  bodyTextAfterSubmitPreview?: string;
}

interface DesktopPickerDomEvidence {
  workspaceOpened: boolean;
  composerVisible: boolean;
  modelPickerOpened: boolean;
  modelTextSeen: boolean;
  existingModelTextSeen: boolean;
  bodyTextPreview: string;
  pickerTextPreview: string;
}

interface DesktopSelectedModelEvidence {
  requestedModel: string;
  requestedDisplayName: string;
  activeModelAlreadySelected: boolean;
  selectedModelTextSeen: boolean;
  selectionAction?: string;
  activeComposerTextPreview: string;
}

interface DesktopVisibleResponseEvidence {
  expectedMarker: string;
  markerSeen: boolean;
  modelErrorSeen: boolean;
  bodyTextPreview: string;
}

interface DesktopCdpProbeResult {
  available: boolean;
  browser: string | undefined;
  targets: Array<{ id?: string; type?: string; title?: string; url?: string }>;
  bodyTextPreview?: string;
  pickerTextPreview?: string;
  signInRequired: boolean;
  workspaceOpened: boolean;
  composerVisible: boolean;
  modelPickerOpened: boolean;
  modelTextSeen: boolean;
  existingModelTextSeen: boolean;
  selectedModelTextSeen: boolean;
  desktopPromptSubmitted: boolean;
  desktopProbeTextSeen: boolean;
  desktopModelErrorSeen: boolean;
  actions: string[];
  resourceUrls: string[];
  pickerDomEvidence?: DesktopPickerDomEvidence;
  selectedModelEvidence?: DesktopSelectedModelEvidence;
  composerSubmissionEvidence?: DesktopPromptSubmissionEvidence;
  visibleResponseEvidence?: DesktopVisibleResponseEvidence;
  error?: string;
}

export function createScenarios(): Scenario[] {
  return [
    staticScenario(),
    bridgeProtocolScenario(),
    localBackendScenario(),
    cursorAgentScenario(),
    cursorAgentTrafficScenario(),
    cursorAgentAcpScenario(),
    desktopRouteScenario(),
    desktopUiScenario(),
  ];
}

function staticScenario(): Scenario {
  return {
    id: "static",
    suite: "static",
    description: "Build, unit/integration tests, and format check",
    async run(context) {
      const started = Date.now();
      const result = await context.processRunner.run({
        command: "pnpm",
        args: ["check"],
        timeoutMs: context.options.timeoutMs,
        logName: "static-pnpm-check",
      });
      return processScenarioResult({
        id: "static",
        suite: "static",
        started,
        result,
        successMessage: "pnpm check passed",
        failureCode: result.timedOut ? "timeout" : "command_failed",
      });
    },
  };
}

function bridgeProtocolScenario(): Scenario {
  return {
    id: "bridge-protocol",
    suite: "bridge-protocol",
    description: "Bridge protocol integration and route tests",
    async run(context) {
      const started = Date.now();
      const result = await context.processRunner.run({
        command: "pnpm",
        args: [
          "exec",
          "vitest",
          "run",
          "tests/server.integration.test.ts",
          "tests/routeInventory.test.ts",
          "tests/upstream.test.ts",
        ],
        timeoutMs: context.options.timeoutMs,
        logName: "bridge-protocol-vitest",
      });
      return processScenarioResult({
        id: "bridge-protocol",
        suite: "bridge-protocol",
        started,
        result,
        successMessage: "bridge protocol tests passed",
        failureCode: result.timedOut ? "timeout" : "command_failed",
      });
    },
  };
}

function localBackendScenario(): Scenario {
  return {
    id: "local-backend",
    suite: "local-backend",
    description: "OpenAI-compatible local backend probe",
    async run(context) {
      const started = Date.now();
      const report = await probeLocalBackend({
        baseUrl: context.options.baseUrl,
        model: context.options.providerModel,
        apiKey: context.options.apiKey,
        timeoutMs: context.options.timeoutMs,
      });
      const artifact = context.artifacts.writeJson(
        "local-backend-report.json",
        report,
      );
      return {
        id: "local-backend",
        suite: "local-backend",
        status: report.ok ? "passed" : "failed",
        durationMs: Date.now() - started,
        message: report.message,
        failureCode: report.failureCode,
        artifacts: { report: artifact },
        details: {
          modelsStatus: report.modelsStatus,
          chatStatus: report.chatStatus,
          models: report.models,
          completionPreview: report.completionPreview,
        },
      };
    },
  };
}

function cursorAgentScenario(): Scenario {
  return {
    id: "cursor-agent",
    suite: "cursor-agent",
    description: "Real cursor-agent CLI smoke test",
    async run(context) {
      const started = Date.now();
      const result = await context.processRunner.run({
        command: "pnpm",
        args: ["e2e:cursor-agent"],
        env: isolatedCursorAgentEnv(context.options),
        timeoutMs: context.options.timeoutMs,
        logName: "cursor-agent-e2e",
      });
      return processScenarioResult({
        id: "cursor-agent",
        suite: "cursor-agent",
        started,
        result,
        successMessage: "cursor-agent e2e passed",
        failureCode: result.timedOut ? "timeout" : "model_metadata_rejected",
      });
    },
  };
}

function cursorAgentTrafficScenario(): Scenario {
  return {
    id: "cursor-agent-traffic",
    suite: "cursor-agent-traffic",
    description:
      "Capture real cursor-agent traffic through bridge route inventory",
    async run(context) {
      const started = Date.now();
      const port = await freePort();
      const endpoint = `http://127.0.0.1:${port}`;
      const bridgeLogPath = context.artifacts.pathFor(
        "traffic-probe-bridge.log",
      );
      const bridge = startTrafficProbeBridge(context, port, bridgeLogPath);
      try {
        await waitForFilePattern(bridgeLogPath, /bridge listening/, bridge);
        const listModels = await context.processRunner.run({
          command: "cursor-agent",
          args: ["--endpoint", endpoint, "--list-models"],
          env: scrubbedHarnessEnv(context.options.env),
          timeoutMs: context.options.timeoutMs,
          logName: "traffic-cursor-agent-list-models",
        });
        const prompt = await context.processRunner.run({
          command: "cursor-agent",
          args: [
            "--endpoint",
            endpoint,
            "--model",
            context.options.model,
            "--print",
            "Reply with traffic-probe-ok.",
          ],
          env: scrubbedHarnessEnv(context.options.env),
          timeoutMs: context.options.timeoutMs,
          logName: "traffic-cursor-agent-print",
        });
        await waitForFilePattern(
          bridgeLogPath,
          /desktop route inventory/,
          bridge,
          2_000,
        ).catch(() => undefined);
        const bridgeLog = fs.existsSync(bridgeLogPath)
          ? fs.readFileSync(bridgeLogPath, "utf8")
          : "";
        const routeReport = analyzeRouteInventoryLog(bridgeLog);
        const agentRunDiagnostics = parseAgentRunDiagnostics(bridgeLog);
        const report = {
          endpoint,
          model: context.options.model,
          listModels: processRunSummary(listModels),
          prompt: processRunSummary(prompt),
          routeInventory: routeReport,
          agentRunDiagnostics,
          listedModel:
            listModels.stdout.includes(context.options.model) ||
            listModels.stdout.includes(context.options.displayName),
          completedPrompt:
            prompt.stdout.includes("traffic-probe-ok") ||
            prompt.stdout.includes(context.options.model),
        };
        const reportPath = context.artifacts.writeJson(
          "traffic-probe-report.json",
          report,
        );
        const failureCode = trafficFailureCode(report);
        return {
          id: "cursor-agent-traffic",
          suite: "cursor-agent-traffic",
          status: failureCode === undefined ? "passed" : "failed",
          durationMs: Date.now() - started,
          message:
            failureCode === undefined
              ? "cursor-agent traffic reached the bridge and completed the probe"
              : trafficFailureMessage(failureCode),
          failureCode,
          artifacts: {
            bridgeLog: bridgeLogPath,
            listModelsLog: listModels.logPath,
            promptLog: prompt.logPath,
            report: reportPath,
          },
          details: {
            endpoint,
            observedPaths: routeReport.observedPaths,
            modelRoutesSeen: routeReport.modelRoutesSeen,
            agentRunDiagnostics,
            listedModel: report.listedModel,
            completedPrompt: report.completedPrompt,
          },
        };
      } finally {
        bridge.kill("SIGTERM");
      }
    },
  };
}

function cursorAgentAcpScenario(): Scenario {
  return {
    id: "cursor-agent-acp-experimental",
    suite: "cursor-agent-acp-experimental",
    description: "Experimental ACP JSON-RPC smoke test through the bridge",
    async run(context) {
      const started = Date.now();
      const port = await freePort();
      const endpoint = `http://127.0.0.1:${port}`;
      const bridgeLogPath = context.artifacts.pathFor("acp-probe-bridge.log");
      const bridge = startTrafficProbeBridge(context, port, bridgeLogPath);
      try {
        await waitForFilePattern(bridgeLogPath, /bridge listening/, bridge);
        const report = await runAcpProbe(context, endpoint, bridgeLogPath);
        const reportPath = context.artifacts.writeJson(
          "acp-probe-report.json",
          report,
        );
        const failureCode = acpFailureCode(report);
        return {
          id: "cursor-agent-acp-experimental",
          suite: "cursor-agent-acp-experimental",
          status: failureCode === undefined ? "passed" : "failed",
          durationMs: Date.now() - started,
          message:
            failureCode === undefined
              ? "ACP JSON-RPC prompt reached the bridge and completed"
              : acpFailureMessage(failureCode),
          failureCode,
          artifacts: {
            bridgeLog: bridgeLogPath,
            report: reportPath,
          },
          details: {
            endpoint,
            textPreview: report.textPreview,
            observedPaths: report.routeInventory.observedPaths,
            modelRoutesSeen: report.routeInventory.modelRoutesSeen,
          },
        };
      } finally {
        bridge.kill("SIGTERM");
      }
    },
  };
}

function desktopUiScenario(): Scenario {
  return {
    id: "desktop-ui-experimental",
    suite: "desktop-ui-experimental",
    description: "Optional Cursor desktop CDP attachment probe",
    async run(context) {
      const started = Date.now();
      const debugPort = await freePort();
      const instanceId = `desktop-ui-${debugPort}`;
      const scriptedBackend =
        context.options.env.E2E_SCRIPTED_TOOL_BACKEND === "true"
          ? await startScriptedToolBackend()
          : undefined;
      const effectiveBaseUrl =
        scriptedBackend?.baseUrl ?? context.options.baseUrl;
      const ckLogPath = path.join(
        context.options.cwd,
        ".cursor-rpc",
        "ck",
        instanceId,
        "bridge.log",
      );
      const userDataDir = path.join(
        context.options.cwd,
        ".cursor-rpc",
        "ck",
        instanceId,
        "user-data",
      );
      const modelEnv = {
        BRIDGE_MODELS_JSON: JSON.stringify([
          {
            id: context.options.model,
            displayName: context.options.displayName,
            providerModel: context.options.providerModel,
            baseUrl: effectiveBaseUrl,
            apiKey: context.options.apiKey,
            contextTokenLimit: 128000,
          },
        ]),
        ...(context.options.env.BRIDGE_LOG_MODEL_PAYLOADS !== undefined
          ? {
              BRIDGE_LOG_MODEL_PAYLOADS:
                context.options.env.BRIDGE_LOG_MODEL_PAYLOADS,
            }
          : {}),
        BRIDGE_AGENT_NATIVE_CONTEXT: "false",
      };
      const commandLogPath = context.artifacts.writeText(
        "logs/desktop-ui-ck-live.log",
        "",
      );
      const log = fs.createWriteStream(commandLogPath, { flags: "w" });
      const writeCommandLog = (chunk: Buffer) => {
        if (!log.writableEnded && !log.destroyed) {
          log.write(chunk);
        }
      };
      const ck = spawn(
        "pnpm",
        desktopUiCkArgs(context.options, debugPort, instanceId),
        {
          cwd: context.options.cwd,
          env: {
            ...process.env,
            ...scrubbedHarnessEnv(context.options.env),
            ...modelEnv,
          },
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      ck.stdout?.on("data", writeCommandLog);
      ck.stderr?.on("data", writeCommandLog);
      try {
        await waitForProcessOutput(ck, /bridge listening/, 15_000);
        await waitForDesktopWorkbenchReady(
          debugPort,
          context.options.timeoutMs,
        );
        const localModelSeedStatus = seedLocalModelsIntoCursorState({
          agentHttpPort: debugPort + 4,
          bridge: {
            executable: "pnpm",
            args: [],
            env: modelEnv,
          },
          profileMode: "isolated",
          userDataDir,
        });
        await reloadDesktopWorkbench(debugPort, 10_000);
        const cdp = await probeDesktopCdp(
          debugPort,
          context.options.timeoutMs,
          {
            displayName: context.options.displayName,
            model: context.options.model,
          },
        );
        if (cdp.desktopPromptSubmitted) {
          await waitForDesktopCompletionLog(
            ckLogPath,
            context.options.timeoutMs,
          );
        } else {
          await delay(2_000);
        }
        const ckLog = fs.existsSync(ckLogPath)
          ? fs.readFileSync(ckLogPath, "utf8")
          : "";
        const routeInventory = analyzeRouteInventoryLog(ckLog);
        const modelBackendRequestSeen = desktopModelBackendRequestSeen(
          ckLog,
          effectiveBaseUrl,
        );
        const modelBackendResponseComplete =
          desktopModelBackendResponseComplete(ckLog, effectiveBaseUrl);
        const cursorToolResultSeen = desktopCursorToolResultSeen(ckLog);
        const requiredCursorToolResultsSeen =
          scriptedBackend === undefined ||
          desktopCursorToolNamesSeen(ckLog, ["read_file", "list_dir", "grep"]);
        const backendRequestEvidence = desktopBackendRequestEvidence(
          ckLog,
          effectiveBaseUrl,
          modelBackendRequestSeen,
          modelBackendResponseComplete,
        );
        const routeUncertaintyEvidence = {
          observedPaths: routeInventory.observedPaths,
          routeSummary: routeInventory.routeSummary,
          routeCategories: routeInventory.routeCategories,
          passThroughRoutes: routeInventory.passThroughRoutes,
          failedRoutes: routeInventory.failedRoutes,
        };
        const report = {
          debugPort,
          instanceId,
          ckProfileMode: "isolated-seeded-from-default",
          requestedDefaultProfile: context.options.useDefaultProfile,
          localModelSeedStatus,
          cdp,
          routeInventory,
          routeUncertaintyEvidence,
          pickerDomEvidence: cdp.pickerDomEvidence,
          selectedModelEvidence: cdp.selectedModelEvidence,
          composerSubmissionEvidence: cdp.composerSubmissionEvidence,
          backendRequestEvidence,
          visibleResponseEvidence: cdp.visibleResponseEvidence,
          modelBackendRequestSeen,
          modelBackendResponseComplete,
          cursorToolResultSeen,
          requiredCursorToolResultsSeen,
          scriptedBackendRequests: scriptedBackend?.requests,
        };
        const reportPath = context.artifacts.writeJson(
          "desktop-ui-cdp-report.json",
          report,
        );
        const pickerDomEvidencePath = context.artifacts.writeJson(
          "desktop-ui-picker-dom-evidence.json",
          cdp.pickerDomEvidence ?? {},
        );
        const selectedModelEvidencePath = context.artifacts.writeJson(
          "desktop-ui-selected-model-evidence.json",
          cdp.selectedModelEvidence ?? {},
        );
        const composerSubmissionEvidencePath = context.artifacts.writeJson(
          "desktop-ui-composer-submission-evidence.json",
          cdp.composerSubmissionEvidence ?? {},
        );
        const backendRequestEvidencePath = context.artifacts.writeJson(
          "desktop-ui-mlx-backend-request-evidence.json",
          backendRequestEvidence,
        );
        const visibleResponseEvidencePath = context.artifacts.writeJson(
          "desktop-ui-visible-response-evidence.json",
          cdp.visibleResponseEvidence ?? {},
        );
        const routeUncertaintyEvidencePath = context.artifacts.writeJson(
          "desktop-ui-route-uncertainty.json",
          routeUncertaintyEvidence,
        );
        const desktopSendRoutesSeen = desktopSendRoutes(routeInventory);
        const ckBridgeLogArtifact = captureTextArtifactIfExists(
          ckLogPath,
          "logs/desktop-ui-bridge.log",
          context,
        );
        const ckConnectProxyLogArtifact = captureTextArtifactIfExists(
          path.join(
            context.options.cwd,
            ".cursor-rpc",
            "ck",
            instanceId,
            "connect-proxy.log",
          ),
          "logs/desktop-ui-connect-proxy.log",
          context,
        );
        const cursorLogArtifacts = captureCursorProfileLogs(
          userDataDir,
          context,
        );
        const passed =
          cdp.available &&
          !cdp.signInRequired &&
          cdp.workspaceOpened &&
          cdp.composerVisible &&
          cdp.modelPickerOpened &&
          cdp.modelTextSeen &&
          cdp.selectedModelTextSeen &&
          (cdp.existingModelTextSeen ||
            cdp.desktopProbeTextSeen ||
            modelBackendRequestSeen) &&
          cdp.desktopPromptSubmitted &&
          !cdp.desktopModelErrorSeen &&
          (desktopSendRoutesSeen.length > 0 || modelBackendRequestSeen) &&
          modelBackendRequestSeen &&
          modelBackendResponseComplete &&
          cdp.desktopProbeTextSeen &&
          (scriptedBackend === undefined || cursorToolResultSeen) &&
          requiredCursorToolResultsSeen;
        const failureCode = desktopUiFailureCode(
          cdp,
          routeInventory,
          modelBackendRequestSeen,
          modelBackendResponseComplete,
        );
        const status = passed
          ? "passed"
          : desktopUiSkipCode(failureCode) === undefined
            ? "failed"
            : "skipped";
        return {
          id: "desktop-ui-experimental",
          suite: "desktop-ui-experimental",
          status,
          durationMs: Date.now() - started,
          message: passed
            ? "Cursor desktop model picker showed and used the configured local model"
            : desktopUiFailureMessage(
                cdp,
                routeInventory,
                modelBackendRequestSeen,
                modelBackendResponseComplete,
              ),
          failureCode: passed ? undefined : failureCode,
          artifacts: {
            commandLog: commandLogPath,
            report: reportPath,
            pickerDomEvidence: pickerDomEvidencePath,
            selectedModelEvidence: selectedModelEvidencePath,
            composerSubmissionEvidence: composerSubmissionEvidencePath,
            mlxBackendRequestEvidence: backendRequestEvidencePath,
            visibleResponseEvidence: visibleResponseEvidencePath,
            routeUncertainty: routeUncertaintyEvidencePath,
            ckBridgeLog: ckBridgeLogArtifact ?? ckLogPath,
            ...(ckConnectProxyLogArtifact !== undefined
              ? { ckConnectProxyLog: ckConnectProxyLogArtifact }
              : {}),
            ...cursorLogArtifacts,
          },
          details: {
            debugPort,
            ckProfileMode: "isolated-seeded-from-default",
            requestedDefaultProfile: context.options.useDefaultProfile,
            targetCount: cdp.targets.length,
            browser: cdp.browser,
            signInRequired: cdp.signInRequired,
            workspaceOpened: cdp.workspaceOpened,
            composerVisible: cdp.composerVisible,
            modelPickerOpened: cdp.modelPickerOpened,
            modelTextSeen: cdp.modelTextSeen,
            existingModelTextSeen: cdp.existingModelTextSeen,
            selectedModelTextSeen: cdp.selectedModelTextSeen,
            desktopPromptSubmitted: cdp.desktopPromptSubmitted,
            desktopProbeTextSeen: cdp.desktopProbeTextSeen,
            desktopModelErrorSeen: cdp.desktopModelErrorSeen,
            desktopSendRoutesSeen,
            modelBackendRequestSeen,
            modelBackendResponseComplete,
            cursorToolResultSeen,
            requiredCursorToolResultsSeen,
            scriptedBackendRequests: scriptedBackend?.requests,
            modelRoutesSeen: routeInventory.modelRoutesSeen,
            localModelSeedStatus,
            actions: cdp.actions,
            resourceUrls: cdp.resourceUrls,
            error: cdp.error,
          },
        };
      } finally {
        ck.stdout?.off("data", writeCommandLog);
        ck.stderr?.off("data", writeCommandLog);
        terminateProcessGroup(ck, "SIGTERM");
        cleanupIsolatedCursorProcesses(userDataDir);
        log.end();
        scriptedBackend?.server.close();
      }
    },
  };
}

export function desktopUiCkArgs(
  options: Pick<HarnessOptions, "timeoutMs" | "useDefaultProfile">,
  debugPort: number,
  instanceId: string,
): string[] {
  // CDP attachment needs a fresh Electron profile; the default profile can hand
  // off to an already-running Cursor process and drop the debug port.
  return [
    "ck",
    "--debug-port",
    String(debugPort),
    "--instance-id",
    instanceId,
    "--seed-auth-from-default",
    "--timeout-ms",
    String(Math.min(options.timeoutMs, 5_000)),
  ];
}

function terminateProcessGroup(
  childProcess: ChildProcess,
  signal: NodeJS.Signals,
): void {
  if (childProcess.pid === undefined || process.platform === "win32") {
    childProcess.kill(signal);
    return;
  }
  try {
    process.kill(-childProcess.pid, signal);
  } catch {
    childProcess.kill(signal);
  }
}

function captureCursorProfileLogs(
  userDataDir: string,
  context: ScenarioContext,
): Record<string, string> {
  const logsDir = path.join(userDataDir, "logs");
  if (!fs.existsSync(logsDir)) {
    return {};
  }
  const captured: Record<string, string> = {};
  for (const filePath of listFilesRecursively(logsDir)) {
    const name = path.basename(filePath);
    if (!name.endsWith(".log")) {
      continue;
    }
    const relative = path
      .relative(logsDir, filePath)
      .replaceAll(path.sep, "__");
    const artifactName = `logs/cursor-${relative}`;
    captured[`cursorLog_${relative.replaceAll(".", "_")}`] =
      context.artifacts.writeText(
        artifactName,
        fs.readFileSync(filePath, "utf8").slice(-120_000),
      );
  }
  return captured;
}

function captureTextArtifactIfExists(
  sourcePath: string,
  artifactName: string,
  context: ScenarioContext,
): string | undefined {
  if (!fs.existsSync(sourcePath)) {
    return undefined;
  }
  return context.artifacts.writeText(
    artifactName,
    fs.readFileSync(sourcePath, "utf8").slice(-200_000),
  );
}

function listFilesRecursively(directory: string): string[] {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function desktopRouteScenario(): Scenario {
  return {
    id: "desktop-route",
    suite: "desktop-route",
    description: "Cursor desktop route inventory smoke test",
    async run(context) {
      const started = Date.now();
      const result = await context.processRunner.run({
        command: "pnpm",
        args: [
          "ck",
          "test",
          ...(context.options.useDefaultProfile
            ? ["--use-default-profile"]
            : []),
          "--timeout-ms",
          String(context.options.timeoutMs),
        ],
        env: {
          BRIDGE_MODELS_JSON: JSON.stringify([
            {
              id: context.options.model,
              displayName: context.options.displayName,
              providerModel: context.options.providerModel,
              baseUrl: context.options.baseUrl,
              apiKey: context.options.apiKey,
              contextTokenLimit: 128000,
            },
          ]),
        },
        timeoutMs: context.options.timeoutMs + 15_000,
        logName: "desktop-route-ck-test",
      });
      const ckLogPath = path.join(
        context.options.cwd,
        ".cursor-rpc",
        "ck",
        "bridge.log",
      );
      const ckLog = fs.existsSync(ckLogPath)
        ? fs.readFileSync(ckLogPath, "utf8")
        : "";
      const report = analyzeRouteInventoryLog(ckLog);
      const reportPath = context.artifacts.writeJson(
        "desktop-route-report.json",
        report,
      );
      const status =
        result.exitCode === 0 &&
        report.routeInventorySeen &&
        report.modelRoutesSeen.length > 0;
      return {
        id: "desktop-route",
        suite: "desktop-route",
        status: status ? "passed" : "failed",
        durationMs: Date.now() - started,
        message: status
          ? "desktop route inventory reached the bridge"
          : report.diagnosis.join(" "),
        failureCode: desktopFailureCode(report, result),
        artifacts: {
          commandLog: result.logPath,
          routeReport: reportPath,
          ckBridgeLog: ckLogPath,
        },
        details: { ...report },
      };
    },
  };
}

function processScenarioResult(options: {
  id: ScenarioResult["id"];
  suite: ScenarioResult["suite"];
  started: number;
  result: ProcessRunResult;
  successMessage: string;
  failureCode: FailureCode;
}): ScenarioResult {
  const passed = options.result.exitCode === 0 && !options.result.timedOut;
  return {
    id: options.id,
    suite: options.suite,
    status: passed ? "passed" : "failed",
    durationMs: Date.now() - options.started,
    message: passed
      ? options.successMessage
      : commandFailureMessage(options.result),
    failureCode: passed ? undefined : options.failureCode,
    artifacts: { log: options.result.logPath },
    details: {
      exitCode: options.result.exitCode,
      signal: options.result.signal,
      timedOut: options.result.timedOut,
    },
  };
}

function commandFailureMessage(result: ProcessRunResult): string {
  if (result.timedOut) {
    return `Command timed out: ${result.command} ${result.args.join(" ")}`;
  }
  return `Command failed with exit ${String(result.exitCode)}: ${result.command} ${result.args.join(" ")}`;
}

function isolatedCursorAgentEnv(options: HarnessOptions): NodeJS.ProcessEnv {
  return {
    ...scrubbedHarnessEnv(options.env),
    MODEL_NAME: options.model,
    MODEL_PROVIDER_MODEL: options.providerModel,
    MODEL_BASE_URL: options.baseUrl,
    MODEL_API_KEY: options.apiKey,
  };
}

function desktopFailureCode(
  report: ReturnType<typeof analyzeRouteInventoryLog>,
  result: ProcessRunResult,
): FailureCode {
  if (result.timedOut) {
    return "timeout";
  }
  if (result.exitCode !== 0) {
    return "bridge_start_failed";
  }
  if (!report.routeInventorySeen) {
    return "route_missing";
  }
  if (report.modelRoutesSeen.length === 0) {
    return "model_route_missing";
  }
  return "model_metadata_rejected";
}

function desktopUiFailureCode(
  cdp: DesktopCdpProbeResult,
  routeInventory: ReturnType<typeof analyzeRouteInventoryLog>,
  modelBackendRequestSeen: boolean,
  modelBackendResponseComplete: boolean,
): FailureCode {
  if (!cdp.available) {
    return "not_available";
  }
  if (cdp.signInRequired) {
    return "auth_profile_blocked";
  }
  if (!cdp.workspaceOpened || !cdp.composerVisible) {
    return "not_available";
  }
  if (!cdp.modelPickerOpened || !cdp.modelTextSeen) {
    return "desktop_picker_missing";
  }
  if (!cdp.selectedModelTextSeen) {
    return "desktop_model_selection_missing";
  }
  if (!cdp.desktopPromptSubmitted) {
    return "desktop_prompt_submission_failed";
  }
  if (cdp.desktopModelErrorSeen) {
    return "model_metadata_rejected";
  }
  if (
    desktopSendRoutes(routeInventory).length === 0 &&
    !modelBackendRequestSeen
  ) {
    return "extension_host_route_missing";
  }
  if (!modelBackendRequestSeen) {
    return "desktop_backend_request_missing";
  }
  if (!modelBackendResponseComplete) {
    return "local_completion_failed";
  }
  if (!cdp.desktopProbeTextSeen) {
    return "desktop_visible_response_missing";
  }
  return "model_metadata_rejected";
}

function desktopUiFailureMessage(
  cdp: DesktopCdpProbeResult,
  routeInventory: ReturnType<typeof analyzeRouteInventoryLog>,
  modelBackendRequestSeen: boolean,
  modelBackendResponseComplete: boolean,
): string {
  if (!cdp.available) {
    return "Cursor desktop did not expose a debuggable Chromium target";
  }
  if (cdp.signInRequired) {
    return "Cursor desktop CDP worked, but the isolated seeded profile still requires login";
  }
  if (!cdp.workspaceOpened) {
    return "Cursor desktop opened, but the test workspace was not visible";
  }
  if (!cdp.composerVisible) {
    return "Cursor desktop opened, but the agent composer was not visible";
  }
  if (!cdp.modelPickerOpened) {
    return "Cursor desktop opened, but the model picker did not open";
  }
  if (!cdp.modelTextSeen) {
    return "Cursor desktop model picker opened, but the configured local model was not visible";
  }
  if (!cdp.selectedModelTextSeen) {
    return "Cursor desktop model picker showed the local model, but the active composer did not show it as selected";
  }
  if (
    !cdp.existingModelTextSeen &&
    !cdp.desktopProbeTextSeen &&
    !modelBackendRequestSeen
  ) {
    return "Cursor desktop model picker opened, but existing Cursor models were not visible";
  }
  if (!cdp.desktopPromptSubmitted) {
    return "Cursor desktop model picker opened, but the test prompt could not be submitted";
  }
  if (cdp.desktopModelErrorSeen) {
    return "Cursor desktop selected the local model, but sending a prompt produced a model-not-found error";
  }
  if (
    desktopSendRoutes(routeInventory).length === 0 &&
    !modelBackendRequestSeen
  ) {
    return "Cursor desktop selected the local model and submitted the prompt, but no Agent execution route or local model backend request was observed; bridge routing is working for desktop metadata routes, but the injected model is not yet accepted by the desktop Agent execution path";
  }
  if (!modelBackendRequestSeen) {
    return "Cursor desktop Agent execution reached the bridge, but no OpenAI-compatible backend request was observed";
  }
  if (!modelBackendResponseComplete) {
    return "Cursor desktop Agent execution reached the local OpenAI-compatible backend, but generation did not complete before validation cleanup";
  }
  if (!cdp.desktopProbeTextSeen) {
    return "Cursor desktop completed the local backend request, but the expected desktop-probe-ok marker was not visible in the UI";
  }
  return "Cursor desktop model picker opened, but the configured local model was not visible";
}

function desktopUiSkipCode(code: FailureCode): FailureCode | undefined {
  switch (code) {
    case "not_available":
    case "auth_profile_blocked":
    case "backend_unreachable":
      return code;
    case "desktop_picker_missing":
    case "desktop_model_selection_missing":
    case "desktop_prompt_submission_failed":
    case "desktop_backend_request_missing":
    case "desktop_visible_response_missing":
    case "route_missing":
    case "model_route_missing":
    case "extension_host_route_missing":
    case "model_metadata_rejected":
    case "local_completion_failed":
    case "bridge_start_failed":
    case "upstream_passthrough_failed":
    case "command_failed":
    case "timeout":
      return undefined;
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

function desktopModelBackendRequestSeen(
  logText: string,
  baseUrl: string,
): boolean {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  return (
    logText.includes('"message":"model backend request"') &&
    logText.includes(`${normalizedBaseUrl}/chat/completions`)
  );
}

function desktopModelBackendResponseComplete(
  logText: string,
  baseUrl: string,
): boolean {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  return (
    logText.includes('"message":"model backend response complete"') &&
    logText.includes(`${normalizedBaseUrl}/chat/completions`) &&
    logText.includes('"message":"served local agent run"')
  );
}

function desktopBackendRequestEvidence(
  logText: string,
  baseUrl: string,
  requestSeen: boolean,
  responseComplete: boolean,
): {
  baseUrl: string;
  chatCompletionsUrl: string;
  requestSeen: boolean;
  responseComplete: boolean;
  events: Array<Record<string, unknown>>;
} {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  return {
    baseUrl: normalizedBaseUrl,
    chatCompletionsUrl: `${normalizedBaseUrl}/chat/completions`,
    requestSeen,
    responseComplete,
    events: parseJsonLogEvents(logText, [
      "model backend request",
      "model backend response complete",
      "served local agent run",
    ]),
  };
}

function parseJsonLogEvents(
  logText: string,
  messages: string[],
): Array<Record<string, unknown>> {
  const messageSet = new Set(messages);
  const events: Array<Record<string, unknown>> = [];
  for (const line of logText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (
        typeof parsed.message === "string" &&
        messageSet.has(parsed.message)
      ) {
        events.push(parsed);
      }
    } catch {
      continue;
    }
  }
  return events;
}

function desktopCursorToolResultSeen(logText: string): boolean {
  return (
    logText.includes('"message":"requested cursor tool execution"') &&
    logText.includes('"message":"received cursor tool result"')
  );
}

function desktopCursorToolNamesSeen(
  logText: string,
  toolNames: string[],
): boolean {
  const resultCount = (
    logText.match(/"message":"received cursor tool result"/g) ?? []
  ).length;
  return (
    resultCount >= toolNames.length &&
    toolNames.every((toolName) => logText.includes(`"toolName":"${toolName}"`))
  );
}

async function startScriptedToolBackend(): Promise<ScriptedToolBackend> {
  const requests: ScriptedToolBackendRequest[] = [];
  const server = http.createServer((request, response) => {
    if (request.url === "/v1/models" && request.method === "GET") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          object: "list",
          data: [
            {
              id: "mlx-community/Qwen3.5-4B-8bit",
              object: "model",
              created: 0,
            },
          ],
        }),
      );
      return;
    }
    if (request.url !== "/v1/chat/completions" || request.method !== "POST") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
      return;
    }

    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
          string,
          unknown
        >;
      } catch (error) {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        return;
      }

      const messages = Array.isArray(body.messages)
        ? (body.messages as Array<Record<string, unknown>>)
        : [];
      const tools = Array.isArray(body.tools)
        ? (body.tools as Array<Record<string, unknown>>)
        : [];
      requests.push({
        messageRoles: messages
          .map((message) => message.role)
          .filter((role): role is string => typeof role === "string"),
        toolNames: tools
          .map((tool) =>
            typeof tool.function === "object" &&
            tool.function !== null &&
            !Array.isArray(tool.function)
              ? (tool.function as Record<string, unknown>).name
              : undefined,
          )
          .filter((name): name is string => typeof name === "string"),
        assistantToolCallNames: messages.flatMap((message) =>
          Array.isArray(message.tool_calls)
            ? message.tool_calls
                .map((toolCall) =>
                  typeof toolCall === "object" &&
                  toolCall !== null &&
                  !Array.isArray(toolCall) &&
                  typeof (toolCall as Record<string, unknown>).function ===
                    "object" &&
                  (toolCall as Record<string, unknown>).function !== null
                    ? (
                        (toolCall as Record<string, unknown>)
                          .function as Record<string, unknown>
                      ).name
                    : undefined,
                )
                .filter((name): name is string => typeof name === "string")
            : [],
        ),
        lastMessageRole:
          typeof messages.at(-1)?.role === "string"
            ? (messages.at(-1)?.role as string)
            : undefined,
        lastMessagePreview:
          typeof messages.at(-1)?.content === "string"
            ? (messages.at(-1)?.content as string).slice(0, 500)
            : undefined,
      });

      response.writeHead(200, { "content-type": "text/event-stream" });
      const step = requests.length;
      if (step === 1) {
        response.end(
          scriptedToolCallSse("read-call", "read_file", {
            path: "README.md",
          }),
        );
      } else if (step === 2) {
        response.end(
          scriptedToolCallSse("list-call", "list_dir", { path: "." }),
        );
      } else if (step === 3) {
        response.end(
          scriptedToolCallSse("grep-call", "grep", {
            pattern: "bridge",
            path: ".",
            head_limit: 5,
          }),
        );
      } else {
        response.end(
          [
            'data: {"choices":[{"delta":{"content":"desktop-probe-ok scripted-tool-loop-ok"}}]}',
            "data: [DONE]",
            "",
          ].join("\n"),
        );
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("scripted backend did not bind to a TCP port");
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests,
  };
}

function scriptedToolCallSse(
  id: string,
  name: string,
  args: Record<string, unknown>,
): string {
  return [
    `data: ${JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: {
                  name,
                  arguments: JSON.stringify(args),
                },
              },
            ],
          },
        },
      ],
    })}`,
    'data: {"choices":[{"finish_reason":"tool_calls"}]}',
    "data: [DONE]",
    "",
  ].join("\n");
}

function desktopSendRoutes(
  routeInventory: ReturnType<typeof analyzeRouteInventoryLog>,
): string[] {
  return routeInventory.observedPaths.filter((path) =>
    [
      AGENT_RUN_SSE_PATH,
      AGENT_RUN_PATH,
      BIDI_APPEND_PATH,
      STREAM_CHAT_WITH_TOOLS_PATH,
    ].includes(path),
  );
}

async function waitForDesktopCompletionLog(
  logPath: string,
  timeoutMs: number,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const text = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
    if (text.includes("served local agent run")) {
      return;
    }
    await delay(500);
  }
}

function startTrafficProbeBridge(
  context: ScenarioContext,
  port: number,
  logPath: string,
): ChildProcess {
  const log = fs.createWriteStream(logPath, { flags: "w" });
  const env = concreteEnv({
    ...scrubbedHarnessEnv(context.options.env),
    BRIDGE_PORT: String(port),
    BRIDGE_LOG_LEVEL: "debug",
    BRIDGE_ROUTE_INVENTORY: "true",
    CURSOR_UPSTREAM_BASE_URL:
      context.options.env.CURSOR_UPSTREAM_BASE_URL ?? "https://api2.cursor.sh",
    MODEL_BASE_URL: context.options.baseUrl,
    MODEL_API_KEY: context.options.apiKey,
    MODEL_NAME: context.options.model,
    MODEL_PROVIDER_MODEL: context.options.providerModel,
    MODEL_CONTEXT_TOKEN_LIMIT: "128000",
    BRIDGE_HARDCODED_RESPONSE: "traffic-probe-ok",
  });
  const bridge = spawn(process.execPath, ["dist/src/cli.js", "serve"], {
    cwd: context.options.cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  bridge.stdout?.on("data", (chunk: Buffer) => {
    log.write(chunk);
  });
  bridge.stderr?.on("data", (chunk: Buffer) => {
    log.write(chunk);
  });
  bridge.on("exit", () => log.end());
  return bridge;
}

async function runAcpProbe(
  context: ScenarioContext,
  endpoint: string,
  bridgeLogPath: string,
): Promise<AcpProbeReport> {
  const events: Array<Record<string, unknown>> = [];
  const acp = spawn(
    "cursor-agent",
    [
      "--endpoint",
      endpoint,
      "--model",
      context.options.model,
      "--mode",
      "ask",
      "acp",
    ],
    {
      cwd: context.options.cwd,
      env: concreteEnv(scrubbedHarnessEnv(context.options.env)),
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  if (acp.stdin === null || acp.stdout === null) {
    throw new Error("cursor-agent acp did not expose stdio pipes");
  }
  const acpStdin = acp.stdin;
  const acpStdout = acp.stdout;
  let text = "";
  let nextId = 1;
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: unknown) => void;
    }
  >();
  const rl = readline.createInterface({ input: acpStdout });
  const stderrPath = context.artifacts.pathFor("acp-stderr.log");
  const stderrLog = fs.createWriteStream(stderrPath, { flags: "w" });
  acp.stderr?.on("data", (chunk: Buffer) => stderrLog.write(chunk));

  function send(method: string, params: unknown): Promise<unknown> {
    const id = nextId;
    nextId += 1;
    events.push({ direction: "send", method });
    acpStdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
    );
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
  }

  function respond(id: number | string, result: unknown): void {
    acpStdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
  }

  rl.on("line", (line) => {
    let message: AcpMessage;
    try {
      message = JSON.parse(line) as AcpMessage;
    } catch {
      events.push({ direction: "receive", malformed: true });
      return;
    }

    if (message.id !== undefined && message.method === undefined) {
      const id = Number(message.id);
      const waiter = pending.get(id);
      if (waiter === undefined) {
        return;
      }
      pending.delete(id);
      if (message.error !== undefined) {
        waiter.reject(message.error);
      } else {
        waiter.resolve(message.result);
      }
      return;
    }

    if (message.method !== undefined) {
      events.push({ direction: "receive", method: message.method });
      if (message.method === "session/update") {
        text += extractAcpText(message.params);
      }
      if (message.id !== undefined) {
        respond(message.id, responseForAcpRequest(message.method));
      }
    }
  });

  try {
    await acpStep(
      () =>
        send("initialize", {
          protocolVersion: 1,
          clientCapabilities: {
            fs: { readTextFile: false, writeTextFile: false },
            terminal: false,
          },
          clientInfo: { name: "cursor-rpc-harness", version: "0.1.0" },
        }),
      context.options.timeoutMs,
    );
    const initialized = true;
    await acpStep(
      () => send("authenticate", { methodId: "cursor_login" }),
      context.options.timeoutMs,
    );
    const authenticated = true;
    const sessionResult = await acpStep(
      () =>
        send("session/new", {
          cwd: context.options.cwd,
          mcpServers: [],
        }),
      context.options.timeoutMs,
    );
    const sessionId = extractSessionId(sessionResult);
    if (sessionId === undefined) {
      throw new Error("ACP session/new did not return a session id");
    }
    await acpStep(
      () =>
        send("session/prompt", {
          sessionId,
          prompt: [{ type: "text", text: "Reply with traffic-probe-ok." }],
        }),
      context.options.timeoutMs,
    );
    await waitForFilePattern(
      bridgeLogPath,
      /desktop route inventory/,
      acp,
      2_000,
    ).catch(() => undefined);
    const bridgeLog = fs.existsSync(bridgeLogPath)
      ? fs.readFileSync(bridgeLogPath, "utf8")
      : "";
    return {
      endpoint,
      initialized,
      authenticated,
      sessionCreated: true,
      promptCompleted: true,
      textPreview: text.slice(0, 2_000),
      routeInventory: analyzeRouteInventoryLog(bridgeLog),
      agentRunDiagnostics: parseAgentRunDiagnostics(bridgeLog),
      events,
    };
  } finally {
    rl.close();
    stderrLog.end();
    acp.kill("SIGTERM");
  }
}

async function acpStep<T>(
  step: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return await withTimeout(step(), timeoutMs);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("ACP step timed out")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

function responseForAcpRequest(method: string): unknown {
  switch (method) {
    case "session/request_permission":
      return { outcome: { outcome: "selected", optionId: "reject-once" } };
    case "cursor/ask_question":
      return { outcome: { outcome: "skipped", reason: "harness" } };
    case "cursor/create_plan":
      return { outcome: { outcome: "rejected", reason: "harness" } };
    default:
      return { outcome: { outcome: "skipped", reason: "harness" } };
  }
}

function extractSessionId(result: unknown): string | undefined {
  if (typeof result !== "object" || result === null) {
    return undefined;
  }
  const record = result as Record<string, unknown>;
  if (typeof record.sessionId === "string") {
    return record.sessionId;
  }
  const session = record.session;
  if (typeof session === "object" && session !== null) {
    const sessionRecord = session as Record<string, unknown>;
    if (typeof sessionRecord.id === "string") {
      return sessionRecord.id;
    }
  }
  return undefined;
}

function extractAcpText(params: unknown): string {
  const serialized = JSON.stringify(params);
  if (serialized === undefined) {
    return "";
  }
  const matches = serialized.match(/traffic-probe-ok/g);
  return matches === null ? "" : matches.join("");
}

function scrubbedHarnessEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of Object.keys(env)) {
    if (
      key.startsWith("BRIDGE_") ||
      key.startsWith("MODEL_") ||
      key.startsWith("E2E_") ||
      key === "CURSOR_UPSTREAM_BASE_URL" ||
      key === "CURSOR_UPSTREAM_CONNECT_HOST" ||
      key === "CURSOR_UPSTREAM_CONNECT_PORT"
    ) {
      result[key] = undefined;
    }
  }
  return result;
}

function concreteEnv(overrides: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }
  return env;
}

function waitForProcessOutput(
  process: ChildProcess,
  pattern: RegExp,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${pattern.source}`));
    }, timeoutMs);
    const onData = (chunk: Buffer) => {
      output += chunk.toString("utf8");
      if (pattern.test(output)) {
        cleanup();
        resolve();
      }
    };
    const onExit = () => {
      cleanup();
      reject(new Error("Process exited before expected output"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      process.stdout?.off("data", onData);
      process.stderr?.off("data", onData);
      process.off("exit", onExit);
    };
    process.stdout?.on("data", onData);
    process.stderr?.on("data", onData);
    process.on("exit", onExit);
  });
}

async function waitForFilePattern(
  filePath: string,
  pattern: RegExp,
  process: ChildProcess,
  timeoutMs = 20_000,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (process.exitCode !== null) {
      const contents = fs.existsSync(filePath)
        ? fs.readFileSync(filePath, "utf8")
        : "";
      throw new Error(`bridge exited before ${pattern.source}: ${contents}`);
    }
    const contents = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, "utf8")
      : "";
    if (pattern.test(contents)) {
      return;
    }
    await delay(100);
  }
  throw new Error(`timed out waiting for ${pattern.source}`);
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Unable to allocate port"));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function processRunSummary(result: ProcessRunResult): TrafficProcessSummary {
  return {
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    logPath: result.logPath,
    stdoutPreview: result.stdout.slice(0, 2_000),
    stderrPreview: result.stderr.slice(0, 2_000),
  };
}

async function probeDesktopCdp(
  port: number,
  timeoutMs: number,
  options: { displayName: string; model: string },
): Promise<DesktopCdpProbeResult> {
  const started = Date.now();
  let lastError = "";
  while (Date.now() - started < timeoutMs) {
    try {
      const versionResponse = await fetch(
        `http://127.0.0.1:${port}/json/version`,
      );
      const targetsResponse = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (versionResponse.ok && targetsResponse.ok) {
        const version = (await versionResponse.json()) as Record<
          string,
          unknown
        >;
        const targets = (await targetsResponse.json()) as Array<
          Record<string, unknown>
        >;
        const pageTarget = targets.find((target) => target.type === "page");
        if (pageTarget === undefined) {
          lastError = "CDP available but no page target yet";
          await delay(250);
          continue;
        }
        const pickerProbe =
          typeof pageTarget.webSocketDebuggerUrl === "string"
            ? await probeModelPickerDom(
                pageTarget.webSocketDebuggerUrl,
                timeoutMs,
                options,
              )
            : {
                bodyText: "",
                pickerText: "",
                workspaceOpened: false,
                composerVisible: false,
                modelPickerOpened: false,
                modelTextSeen: false,
                existingModelTextSeen: false,
                selectedModelTextSeen: false,
                desktopPromptSubmitted: false,
                desktopProbeTextSeen: false,
                desktopModelErrorSeen: false,
                actions: [] as string[],
                resourceUrls: [] as string[],
                pickerDomEvidence: undefined,
                selectedModelEvidence: undefined,
                composerSubmissionEvidence: undefined,
                visibleResponseEvidence: undefined,
              };
        return {
          available: true,
          browser:
            typeof version.Browser === "string" ? version.Browser : undefined,
          targets: targets.map((target) => ({
            id: stringField(target.id),
            type: stringField(target.type),
            title: stringField(target.title),
            url: stringField(target.url),
          })),
          bodyTextPreview: pickerProbe.bodyText.slice(0, 2_000),
          pickerTextPreview: pickerProbe.pickerText.slice(0, 4_000),
          signInRequired:
            pickerProbe.bodyText.includes("Log In") ||
            pickerProbe.bodyText.includes("Sign in") ||
            pickerProbe.bodyText.includes("Sign Up"),
          workspaceOpened: pickerProbe.workspaceOpened,
          composerVisible: pickerProbe.composerVisible,
          modelPickerOpened: pickerProbe.modelPickerOpened,
          modelTextSeen: pickerProbe.modelTextSeen,
          existingModelTextSeen: pickerProbe.existingModelTextSeen,
          selectedModelTextSeen: pickerProbe.selectedModelTextSeen,
          desktopPromptSubmitted: pickerProbe.desktopPromptSubmitted,
          desktopProbeTextSeen: pickerProbe.desktopProbeTextSeen,
          desktopModelErrorSeen: pickerProbe.desktopModelErrorSeen,
          actions: pickerProbe.actions,
          resourceUrls: pickerProbe.resourceUrls,
          pickerDomEvidence: pickerProbe.pickerDomEvidence,
          selectedModelEvidence: pickerProbe.selectedModelEvidence,
          composerSubmissionEvidence: pickerProbe.composerSubmissionEvidence,
          visibleResponseEvidence: pickerProbe.visibleResponseEvidence,
        };
      }
      lastError = `HTTP ${versionResponse.status}/${targetsResponse.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(250);
  }
  return {
    available: false,
    browser: undefined,
    targets: [],
    signInRequired: false,
    workspaceOpened: false,
    composerVisible: false,
    modelPickerOpened: false,
    modelTextSeen: false,
    existingModelTextSeen: false,
    selectedModelTextSeen: false,
    desktopPromptSubmitted: false,
    desktopProbeTextSeen: false,
    desktopModelErrorSeen: false,
    actions: [],
    resourceUrls: [],
    error: lastError,
  };
}

async function waitForDesktopWorkbenchReady(
  port: number,
  timeoutMs: number,
): Promise<void> {
  const webSocketDebuggerUrl = await waitForDesktopPageWebSocketUrl(
    port,
    timeoutMs,
  );
  await waitForCdpBodyText(webSocketDebuggerUrl, timeoutMs);
}

async function reloadDesktopWorkbench(
  port: number,
  timeoutMs: number,
): Promise<void> {
  const webSocketDebuggerUrl = await waitForDesktopPageWebSocketUrl(
    port,
    timeoutMs,
  );
  await evaluateCdpValue(webSocketDebuggerUrl, "location.reload()");
  await delay(1_000);
}

async function waitForDesktopPageWebSocketUrl(
  port: number,
  timeoutMs: number,
): Promise<string> {
  const started = Date.now();
  let lastError = "";
  while (Date.now() - started < timeoutMs) {
    try {
      const targetsResponse = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (targetsResponse.ok) {
        const targets = (await targetsResponse.json()) as Array<
          Record<string, unknown>
        >;
        const pageTarget = targets.find((target) => target.type === "page");
        if (typeof pageTarget?.webSocketDebuggerUrl === "string") {
          return pageTarget.webSocketDebuggerUrl;
        }
        lastError = "CDP available but no page target yet";
      } else {
        lastError = `HTTP ${targetsResponse.status}`;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for desktop workbench: ${lastError}`);
}

async function probeModelPickerDom(
  webSocketDebuggerUrl: string,
  timeoutMs: number,
  options: { displayName: string; model: string },
): Promise<{
  bodyText: string;
  pickerText: string;
  workspaceOpened: boolean;
  composerVisible: boolean;
  modelPickerOpened: boolean;
  modelTextSeen: boolean;
  existingModelTextSeen: boolean;
  selectedModelTextSeen: boolean;
  desktopPromptSubmitted: boolean;
  desktopProbeTextSeen: boolean;
  desktopModelErrorSeen: boolean;
  actions: string[];
  resourceUrls: string[];
  pickerDomEvidence: DesktopPickerDomEvidence;
  selectedModelEvidence: DesktopSelectedModelEvidence;
  composerSubmissionEvidence: DesktopPromptSubmissionEvidence;
  visibleResponseEvidence: DesktopVisibleResponseEvidence;
}> {
  const actions: string[] = [];
  let bodyText = await waitForCdpBodyText(webSocketDebuggerUrl, 15_000);
  if (
    bodyText.includes("Log In") ||
    bodyText.includes("Sign in") ||
    bodyText.includes("Sign Up")
  ) {
    return {
      bodyText,
      pickerText: bodyText,
      workspaceOpened: false,
      composerVisible: false,
      modelPickerOpened: false,
      modelTextSeen: false,
      existingModelTextSeen: false,
      selectedModelTextSeen: false,
      desktopPromptSubmitted: false,
      desktopProbeTextSeen: false,
      desktopModelErrorSeen: false,
      actions,
      resourceUrls: [],
      pickerDomEvidence: {
        workspaceOpened: false,
        composerVisible: false,
        modelPickerOpened: false,
        modelTextSeen: false,
        existingModelTextSeen: false,
        bodyTextPreview: bodyText.slice(0, 2_000),
        pickerTextPreview: bodyText.slice(0, 4_000),
      },
      selectedModelEvidence: {
        requestedModel: options.model,
        requestedDisplayName: options.displayName,
        activeModelAlreadySelected: false,
        selectedModelTextSeen: false,
        activeComposerTextPreview: bodyText.slice(0, 2_000),
      },
      composerSubmissionEvidence: {
        promptPreview: "",
        focused: false,
        inserted: false,
        sendAttempted: false,
        submitted: false,
        failureReason: "sign-in-required",
      },
      visibleResponseEvidence: {
        expectedMarker: "desktop-probe-ok",
        markerSeen: false,
        modelErrorSeen: false,
        bodyTextPreview: bodyText.slice(0, 2_000),
      },
    };
  }

  for (const label of ["Skip", "Start Building", "Continue"]) {
    if (await clickVisibleText(webSocketDebuggerUrl, label)) {
      actions.push(`clicked:${label}`);
      await delay(1_000);
      bodyText = await evaluateCdpString(
        webSocketDebuggerUrl,
        "document.body?.innerText ?? ''",
      );
    }
  }
  bodyText = await dismissDataSharingPrompt(
    webSocketDebuggerUrl,
    actions,
    bodyText,
  );

  const workspaceOpened = bodyText.includes("cursorkit");
  if (!composerBodyTextVisible(bodyText)) {
    if (await clickVisibleText(webSocketDebuggerUrl, "New Agent")) {
      actions.push("clicked:New Agent");
      await delay(1_500);
      bodyText = await evaluateCdpString(
        webSocketDebuggerUrl,
        "document.body?.innerText ?? ''",
      );
    }
  }

  let composerVisible =
    (composerBodyTextVisible(bodyText) && composerPromptVisible(bodyText)) ||
    (await desktopComposerDomVisible(webSocketDebuggerUrl));
  let pickerText = bodyText;
  const activeModelAlreadySelected = bodyText
    .toLowerCase()
    .includes(options.displayName.toLowerCase());
  if (composerBodyTextVisible(bodyText) && !activeModelAlreadySelected) {
    const clickedModel =
      await clickVisibleModelPickerTrigger(webSocketDebuggerUrl);
    if (clickedModel !== undefined) {
      actions.push(`clicked:${clickedModel}`);
      await delay(2_000);
      pickerText = await evaluateCdpString(
        webSocketDebuggerUrl,
        "document.body?.innerText ?? ''",
      );
    }
  }

  const lowerPickerText = pickerText.toLowerCase();
  const modelTextSeen =
    lowerPickerText.includes(options.displayName.toLowerCase()) ||
    lowerPickerText.includes(options.model.toLowerCase());
  const existingModelTextSeen = desktopPickerHasBuiltInModel(pickerText);
  const modelPickerOpened =
    pickerText.includes("Balanced quality and speed") ||
    pickerText.includes("Add Models") ||
    pickerText.includes("MAX Mode") ||
    existingModelTextSeen ||
    modelTextSeen;
  let afterPromptText = pickerText;
  let composerSubmissionEvidence: DesktopPromptSubmissionEvidence = {
    promptPreview: "",
    focused: false,
    inserted: false,
    sendAttempted: false,
    submitted: false,
    failureReason: "model-not-visible",
  };
  let selectionAction: string | undefined;
  let selectedModelTextSeen = activeModelAlreadySelected;
  if (modelTextSeen) {
    if (
      !activeModelAlreadySelected &&
      (await clickVisibleText(webSocketDebuggerUrl, options.displayName))
    ) {
      selectionAction = `selected:${options.displayName}`;
      actions.push(selectionAction);
      await delay(750);
    } else if (activeModelAlreadySelected) {
      selectionAction = `selected-preseeded:${options.displayName}`;
      actions.push(selectionAction);
    }
    if (await clickVisibleText(webSocketDebuggerUrl, "Continue")) {
      actions.push("clicked:Continue");
      await delay(750);
    }
    bodyText = await dismissDataSharingPrompt(
      webSocketDebuggerUrl,
      actions,
      await evaluateCdpString(
        webSocketDebuggerUrl,
        "document.body?.innerText ?? ''",
      ),
    );
    bodyText = await ensureDesktopComposerOpen(webSocketDebuggerUrl, actions);
    if (!bodyText.includes(options.displayName)) {
      const activeModel =
        await clickVisibleModelPickerTrigger(webSocketDebuggerUrl);
      if (activeModel !== undefined) {
        actions.push(`clicked:${activeModel}`);
        await delay(750);
        if (await clickVisibleText(webSocketDebuggerUrl, options.displayName)) {
          selectionAction = `selected-active:${options.displayName}`;
          actions.push(selectionAction);
          await delay(750);
        }
      }
    }
    bodyText = await evaluateCdpString(
      webSocketDebuggerUrl,
      "document.body?.innerText ?? ''",
    );
    const lowerBodyText = bodyText.toLowerCase();
    selectedModelTextSeen =
      lowerBodyText.includes(options.displayName.toLowerCase()) ||
      lowerBodyText.includes(options.model.toLowerCase());
    await cdpCommand(webSocketDebuggerUrl, "Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 53,
    });
    await cdpCommand(webSocketDebuggerUrl, "Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 53,
    });
    await delay(500);
    bodyText = await ensureDesktopComposerOpen(webSocketDebuggerUrl, actions);
    composerVisible =
      composerVisible ||
      (composerPromptVisible(bodyText) &&
        (composerBodyTextVisible(bodyText) ||
          bodyText.includes(options.displayName) ||
          bodyText.includes(options.model))) ||
      (await desktopComposerDomVisible(webSocketDebuggerUrl));
    composerSubmissionEvidence = await submitDesktopComposerPrompt(
      webSocketDebuggerUrl,
      "Reply with exactly: desktop-probe-ok",
      actions,
      [options.displayName, options.model],
    );
    if (composerSubmissionEvidence.submitted) {
      actions.push("submitted:desktop-probe");
      afterPromptText = await waitForDesktopPromptResult(
        webSocketDebuggerUrl,
        Math.min(timeoutMs, 60_000),
      );
    }
  }
  const desktopProbeTextSeen = afterPromptText.includes("desktop-probe-ok");
  const desktopModelErrorSeen =
    afterPromptText.includes("AI Model Not Found") ||
    afterPromptText.includes("Model name is not valid");
  const resourceUrls = await evaluateCdpStringArray(
    webSocketDebuggerUrl,
    `performance.getEntriesByType("resource").map((entry) => entry.name).filter(Boolean).slice(-200)`,
  );
  const pickerDomEvidence: DesktopPickerDomEvidence = {
    workspaceOpened,
    composerVisible,
    modelPickerOpened,
    modelTextSeen,
    existingModelTextSeen,
    bodyTextPreview: bodyText.slice(0, 2_000),
    pickerTextPreview: pickerText.slice(0, 4_000),
  };
  const selectedModelEvidence: DesktopSelectedModelEvidence = {
    requestedModel: options.model,
    requestedDisplayName: options.displayName,
    activeModelAlreadySelected,
    selectedModelTextSeen,
    ...(selectionAction !== undefined ? { selectionAction } : {}),
    activeComposerTextPreview: bodyText.slice(0, 2_000),
  };
  const visibleResponseEvidence: DesktopVisibleResponseEvidence = {
    expectedMarker: "desktop-probe-ok",
    markerSeen: desktopProbeTextSeen,
    modelErrorSeen: desktopModelErrorSeen,
    bodyTextPreview: afterPromptText.slice(0, 4_000),
  };

  return {
    bodyText,
    pickerText,
    workspaceOpened,
    composerVisible,
    modelPickerOpened,
    modelTextSeen,
    existingModelTextSeen,
    selectedModelTextSeen,
    desktopPromptSubmitted: composerSubmissionEvidence.submitted,
    desktopProbeTextSeen,
    desktopModelErrorSeen,
    actions,
    resourceUrls,
    pickerDomEvidence,
    selectedModelEvidence,
    composerSubmissionEvidence,
    visibleResponseEvidence,
  };
}

async function ensureDesktopComposerOpen(
  webSocketDebuggerUrl: string,
  actions: string[],
): Promise<string> {
  let text = await evaluateCdpString(
    webSocketDebuggerUrl,
    "document.body?.innerText ?? ''",
  );
  if (
    composerBodyTextVisible(text) &&
    composerPromptVisible(text) &&
    !(await composerIsCancelled(webSocketDebuggerUrl))
  ) {
    return text;
  }
  if (
    (await clickTopRightNewAgent(webSocketDebuggerUrl)) ||
    (await clickVisibleText(webSocketDebuggerUrl, "New Agent"))
  ) {
    actions.push("clicked:New Agent");
    await delay(1_250);
  }
  return evaluateCdpString(
    webSocketDebuggerUrl,
    "document.body?.innerText ?? ''",
  );
}

async function composerIsCancelled(
  webSocketDebuggerUrl: string,
): Promise<boolean> {
  const status = await evaluateCdpValue(
    webSocketDebuggerUrl,
    `document.querySelector('.composer-bar')?.getAttribute('data-composer-status') ?? ''`,
  );
  return status === "cancelled";
}

async function clickTopRightNewAgent(
  webSocketDebuggerUrl: string,
): Promise<boolean> {
  const clicked = await evaluateCdpValue(
    webSocketDebuggerUrl,
    `(() => {
      const candidates = [...document.querySelectorAll('button, [role="button"]')]
        .map((element) => ({
          element,
          text: (element.textContent || '').replace(/\\s+/g, ' ').trim(),
          rect: element.getBoundingClientRect(),
        }))
        .filter(({ text, rect }) =>
          text.includes('New Agent') &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.left > window.innerWidth * 0.65
        )
        .sort((left, right) => right.rect.left - left.rect.left);
      const candidate = candidates.at(0);
      if (!candidate) {
        return false;
      }
      candidate.element.click();
      return true;
    })()`,
  );
  return clicked === true;
}

async function dismissDataSharingPrompt(
  webSocketDebuggerUrl: string,
  actions: string[],
  currentText: string,
): Promise<string> {
  if (
    !currentText.includes("Data Sharing") &&
    !currentText.includes("team admin controls data collection")
  ) {
    return currentText;
  }
  const checked = await evaluateCdpValue(
    webSocketDebuggerUrl,
    `(() => {
      const inputs = [...document.querySelectorAll('input[type="checkbox"], input')]
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width > 0 && rect.height > 0 && rect.top > window.innerHeight * 0.35);
      const checkbox = inputs.at(0)?.element;
      if (!checkbox) {
        return false;
      }
      checkbox.click();
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('input', { bubbles: true }));
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`,
  );
  if (checked === true) {
    actions.push("checked:data-sharing");
    await delay(250);
  }
  if (await clickVisibleText(webSocketDebuggerUrl, "Continue")) {
    actions.push("clicked:Continue");
    await delay(1_000);
  }
  return evaluateCdpString(
    webSocketDebuggerUrl,
    "document.body?.innerText ?? ''",
  );
}

async function submitDesktopComposerPrompt(
  webSocketDebuggerUrl: string,
  prompt: string,
  actions: string[],
  blockedControlTexts: string[] = [],
): Promise<DesktopPromptSubmissionEvidence> {
  const evidence: DesktopPromptSubmissionEvidence = {
    promptPreview: prompt.slice(0, 500),
    focused: false,
    inserted: false,
    sendAttempted: false,
    submitted: false,
  };
  const focusResult = await evaluateCdpString(
    webSocketDebuggerUrl,
    `(() => {
      const monacoTextarea = document.querySelector('.composer-input-blur-wrapper textarea');
      if (monacoTextarea) {
        monacoTextarea.focus();
        monacoTextarea.click();
        return 'monaco-textarea';
      }
      const candidates = [...document.querySelectorAll('textarea, input, [contenteditable="true"]')]
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ element, rect }) => {
          const tag = element.tagName.toLowerCase();
          return rect.width >= 100 && rect.height >= 10 && (tag !== 'input' || element.getAttribute('type') !== 'checkbox');
        })
        .sort((left, right) => {
          const leftEditable = left.element.getAttribute('contenteditable') === 'true' ? 1 : 0;
          const rightEditable = right.element.getAttribute('contenteditable') === 'true' ? 1 : 0;
          return rightEditable - leftEditable || right.rect.width * right.rect.height - left.rect.width * left.rect.height;
        });
      const element = candidates.at(0)?.element;
      if (!element) {
        return '';
      }
      element.click();
      element.focus();
      return element.tagName.toLowerCase() + ':' + (element.getAttribute('contenteditable') || element.getAttribute('placeholder') || '');
    })()`,
  );
  evidence.focused = focusResult.length > 0;
  evidence.focusTarget = focusResult;
  if (!evidence.focused) {
    evidence.failureReason = "composer-focus-target-missing";
    return evidence;
  }
  await clickComposerInputArea(webSocketDebuggerUrl);
  evidence.editorSummary = (
    await describeComposerEditors(webSocketDebuggerUrl)
  ).slice(0, 1200);
  evidence.placeholderSummary = (
    await describeComposerPlaceholders(webSocketDebuggerUrl)
  ).slice(0, 1200);
  evidence.composerHtml = (
    await describeComposerHtml(webSocketDebuggerUrl)
  ).slice(0, 1200);
  actions.push(`composer-editors:${evidence.editorSummary}`);
  actions.push(`composer-placeholders:${evidence.placeholderSummary}`);
  actions.push(`composer-html:${evidence.composerHtml}`);
  await cdpCommand(webSocketDebuggerUrl, "Input.insertText", { text: prompt });
  await delay(100);
  if (!(await composerEditorContains(webSocketDebuggerUrl, prompt))) {
    await typeTextWithCharEvents(webSocketDebuggerUrl, prompt);
    await delay(100);
  }
  if (!(await composerEditorContains(webSocketDebuggerUrl, prompt))) {
    await evaluateCdpValue(
      webSocketDebuggerUrl,
      `document.execCommand('insertText', false, ${JSON.stringify(prompt)})`,
    );
  }
  await delay(250);
  evidence.editorTextAfterInsert = (
    await composerEditorText(webSocketDebuggerUrl)
  ).slice(0, 500);
  evidence.inserted = evidence.editorTextAfterInsert.includes(prompt);
  actions.push(
    `composer-editor-after-insert:${evidence.editorTextAfterInsert}`,
  );
  if (!evidence.inserted) {
    evidence.failureReason = "composer-insert-verification-failed";
    return evidence;
  }
  await clickComposerInputArea(webSocketDebuggerUrl);
  const controlSummary = await describeComposerControls(webSocketDebuggerUrl);
  evidence.controlSummary = controlSummary.slice(0, 1200);
  actions.push(`composer-controls:${controlSummary.slice(0, 1200)}`);
  const sendClickStatus = (await composerEditorContains(
    webSocketDebuggerUrl,
    prompt,
  ))
    ? await clickComposerSendButton(
        webSocketDebuggerUrl,
        prompt,
        blockedControlTexts,
      )
    : "missing-prompt";
  let clicked = sendClickStatus.startsWith("clicked");
  evidence.sendAttempted = clicked;
  evidence.sendClickStatus = sendClickStatus;
  actions.push(`send-clicked:${sendClickStatus}`);
  if (
    !clicked &&
    (await composerEditorContains(webSocketDebuggerUrl, prompt))
  ) {
    await dispatchEnter(webSocketDebuggerUrl, 4);
    clicked = true;
    evidence.sendAttempted = true;
    evidence.sendClickStatus = "cmd-enter";
    actions.push("send-fallback:cmd-enter");
  }
  await delay(750);
  let text = await evaluateCdpString(
    webSocketDebuggerUrl,
    "document.body?.innerText ?? ''",
  );
  if (
    clicked &&
    text.includes(prompt) &&
    !text.includes("Taking longer than expected")
  ) {
    await dispatchEnter(webSocketDebuggerUrl, 4);
    await delay(500);
    text = await evaluateCdpString(
      webSocketDebuggerUrl,
      "document.body?.innerText ?? ''",
    );
  }
  const remainingEditorText = await composerEditorText(webSocketDebuggerUrl);
  if (remainingEditorText.includes(prompt)) {
    await clickComposerInputArea(webSocketDebuggerUrl);
    await dispatchEnter(webSocketDebuggerUrl, 4);
    evidence.sendAttempted = true;
    evidence.sendClickStatus = "cmd-enter-after-click";
    actions.push("send-fallback:cmd-enter-after-click");
    await delay(750);
    text = await evaluateCdpString(
      webSocketDebuggerUrl,
      "document.body?.innerText ?? ''",
    );
  }
  const finalEditorText = await composerEditorText(webSocketDebuggerUrl);
  evidence.editorTextAfterSubmit = finalEditorText.slice(0, 500);
  evidence.bodyTextAfterSubmitPreview = text.slice(0, 2_000);
  actions.push(`composer-editor-after-submit:${finalEditorText.slice(0, 500)}`);
  evidence.submitted =
    (clicked && !finalEditorText.includes(prompt)) ||
    text.includes("Taking longer than expected") ||
    text.includes("desktop-probe-ok");
  if (!evidence.submitted) {
    evidence.failureReason = clicked
      ? "composer-submit-did-not-clear-or-start"
      : "composer-send-control-missing";
  }
  return evidence;
}

async function typeTextWithCharEvents(
  webSocketDebuggerUrl: string,
  text: string,
): Promise<void> {
  for (const char of text) {
    await cdpCommand(webSocketDebuggerUrl, "Input.dispatchKeyEvent", {
      type: "char",
      text: char,
      unmodifiedText: char,
    });
  }
}

async function composerEditorContains(
  webSocketDebuggerUrl: string,
  text: string,
): Promise<boolean> {
  const value = await composerEditorText(webSocketDebuggerUrl);
  return value.includes(text);
}

async function composerEditorText(
  webSocketDebuggerUrl: string,
): Promise<string> {
  return evaluateCdpString(
    webSocketDebuggerUrl,
    `document.querySelector('.aislash-editor-input')?.textContent ?? ''`,
  );
}

async function clickComposerInputArea(
  webSocketDebuggerUrl: string,
): Promise<void> {
  const point = await evaluateCdpValue(
    webSocketDebuggerUrl,
    `(() => {
      const element =
        document.querySelector('.composer-input-blur-wrapper .aislash-editor-input') ||
        document.querySelector('.aislash-editor-input') ||
        document.querySelector('.composer-input-blur-wrapper textarea') ||
        document.querySelector('.composer-input-blur-wrapper, .composer-bar, .pane-body');
      if (!element) {
        return undefined;
      }
      const rect = element.getBoundingClientRect();
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
      };
    })()`,
  );
  if (
    typeof point !== "object" ||
    point === null ||
    typeof (point as { x?: unknown }).x !== "number" ||
    typeof (point as { y?: unknown }).y !== "number"
  ) {
    return;
  }
  const { x, y } = point as { x: number; y: number };
  await evaluateCdpValue(
    webSocketDebuggerUrl,
    `document.querySelector('.composer-input-blur-wrapper .aislash-editor-input')?.focus?.() || document.querySelector('.aislash-editor-input')?.focus?.()`,
  );
  await cdpCommand(webSocketDebuggerUrl, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await cdpCommand(webSocketDebuggerUrl, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
}

async function describeComposerControls(
  webSocketDebuggerUrl: string,
): Promise<string> {
  return evaluateCdpString(
    webSocketDebuggerUrl,
    `(() => {
      const controls = [...document.querySelectorAll('button, [role="button"], [aria-label], [title]')]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const visible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
          return {
            visible,
            text: [
              element.getAttribute('aria-label'),
              element.getAttribute('title'),
              element.textContent,
            ].filter(Boolean).join(' ').replace(/\\s+/g, ' ').trim().slice(0, 120),
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          };
        })
        .filter((entry) => entry.visible && entry.x > window.innerWidth * 0.55)
        .slice(-30);
      return JSON.stringify({
        active: {
          tag: document.activeElement?.tagName,
          text: (document.activeElement?.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 160),
          placeholder: document.activeElement?.getAttribute?.('placeholder') || document.activeElement?.getAttribute?.('aria-placeholder') || '',
        },
        controls,
      });
    })()`,
  );
}

async function describeComposerEditors(
  webSocketDebuggerUrl: string,
): Promise<string> {
  return evaluateCdpString(
    webSocketDebuggerUrl,
    `(() => {
      const editors = [...document.querySelectorAll('textarea, input, [contenteditable="true"], [data-lexical-editor="true"]')]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const visible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
          return {
            visible,
            tag: element.tagName,
            contenteditable: element.getAttribute('contenteditable'),
            placeholder: element.getAttribute('placeholder') || element.getAttribute('aria-placeholder') || '',
            text: (element.textContent || element.getAttribute('value') || '').replace(/\\s+/g, ' ').trim().slice(0, 160),
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          };
        })
        .filter((entry) => entry.visible || entry.tag === 'TEXTAREA')
        .sort((left, right) => left.y - right.y);
      return JSON.stringify(editors);
    })()`,
  );
}

async function describeComposerPlaceholders(
  webSocketDebuggerUrl: string,
): Promise<string> {
  return evaluateCdpString(
    webSocketDebuggerUrl,
    `(() => {
      const entries = [...document.querySelectorAll('*')]
        .map((element) => {
          const text = (element.textContent || '').replace(/\\s+/g, ' ').trim();
          if (!/Plan, Build|Plan, search|for skills|context/i.test(text)) {
            return undefined;
          }
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden' || style.display === 'none') {
            return undefined;
          }
          return {
            tag: element.tagName,
            cls: String(element.className || '').slice(0, 120),
            text: text.slice(0, 160),
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          };
        })
        .filter(Boolean)
        .slice(-20);
      return JSON.stringify(entries);
    })()`,
  );
}

async function describeComposerHtml(
  webSocketDebuggerUrl: string,
): Promise<string> {
  return evaluateCdpString(
    webSocketDebuggerUrl,
    `(() => {
      const element = document.querySelector('.composer-input-blur-wrapper') || document.querySelector('.composer-bar');
      return element?.outerHTML.replace(/\\s+/g, ' ').slice(0, 4000) ?? '';
    })()`,
  );
}

async function dispatchEnter(
  webSocketDebuggerUrl: string,
  modifiers: number,
): Promise<void> {
  await cdpCommand(webSocketDebuggerUrl, "Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 36,
    modifiers,
    unmodifiedText: "\r",
    text: "\r",
  });
  await cdpCommand(webSocketDebuggerUrl, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 36,
    modifiers,
  });
}

async function clickComposerSendButton(
  webSocketDebuggerUrl: string,
  prompt: string,
  blockedControlTexts: string[],
): Promise<string> {
  const directClick = await evaluateCdpString(
    webSocketDebuggerUrl,
    `(() => {
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const prompt = ${JSON.stringify(prompt)};
      const blockedControlTexts = ${JSON.stringify(blockedControlTexts)};
      const isBlockedControlText = (text) => {
        const normalized = text.toLowerCase();
        return blockedControlTexts
          .filter(Boolean)
          .some((blockedText) => normalized.includes(blockedText.toLowerCase()));
      };
      const editor = [...document.querySelectorAll('.aislash-editor-input, [contenteditable="true"], textarea')]
        .map((element) => ({ element, rect: element.getBoundingClientRect(), text: element.textContent || element.value || '' }))
        .filter(({ element, rect, text }) => visible(element) && text.includes(prompt) && rect.width > 20 && rect.height > 10)
        .sort((left, right) => right.rect.left - left.rect.left || left.rect.top - right.rect.top)
        .at(0);
      if (editor) {
        const wrapper =
          editor.element.closest('.composer-input-blur-wrapper') ||
          editor.element.closest('.composer-bar') ||
          editor.element.closest('.pane-body');
        if (wrapper) {
          const wrapperRect = wrapper.getBoundingClientRect();
          const candidates = [...wrapper.querySelectorAll('button, [role="button"], [aria-label], [title]')]
            .map((element) => ({
              element,
              text: [
                element.getAttribute('aria-label'),
                element.getAttribute('title'),
                element.textContent,
              ].filter(Boolean).join(' ').replace(/\\s+/g, ' ').trim(),
              rect: element.getBoundingClientRect(),
              disabled: element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true',
            }))
            .filter(({ element, text, rect, disabled }) =>
              !disabled &&
              visible(element) &&
              rect.left >= wrapperRect.left &&
              rect.right <= wrapperRect.right + 8 &&
              rect.top >= wrapperRect.top &&
              rect.bottom <= wrapperRect.bottom + 8 &&
              !isBlockedControlText(text) &&
              !/\\b(agent|model|local-qwen|gpt|composer|plan|build|context)\\b/i.test(text)
            )
            .sort((left, right) => {
              const leftScore = Math.abs(wrapperRect.right - left.rect.right) + Math.abs(wrapperRect.bottom - left.rect.bottom);
              const rightScore = Math.abs(wrapperRect.right - right.rect.right) + Math.abs(wrapperRect.bottom - right.rect.bottom);
              return leftScore - rightScore;
            });
          const candidate = candidates.at(0);
          if (candidate) {
            candidate.element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse' }));
            candidate.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            candidate.element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse' }));
            candidate.element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            candidate.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            return 'clicked-dom:' + (candidate.text || 'untitled') + '@' + Math.round(candidate.rect.left) + ',' + Math.round(candidate.rect.top) + ',' + Math.round(candidate.rect.width) + 'x' + Math.round(candidate.rect.height);
          }
        }
      }
      return '';
    })()`,
  );
  if (directClick.startsWith("clicked-dom:")) {
    return directClick;
  }
  const shortcut = await evaluateCdpString(
    webSocketDebuggerUrl,
    `(() => {
      const prompt = ${JSON.stringify(prompt)};
      const blockedControlTexts = ${JSON.stringify(blockedControlTexts)};
      const isBlockedControlText = (text) => {
        const normalized = text.toLowerCase();
        return blockedControlTexts
          .filter(Boolean)
          .some((blockedText) => normalized.includes(blockedText.toLowerCase()));
      };
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const editor = [...document.querySelectorAll('.aislash-editor-input, [contenteditable="true"], textarea')]
        .map((element) => ({ element, rect: element.getBoundingClientRect(), text: element.textContent || element.value || '' }))
        .filter(({ element, rect, text }) => visible(element) && text.includes(prompt) && rect.width > 20 && rect.height > 10)
        .sort((left, right) => right.rect.left - left.rect.left || left.rect.top - right.rect.top)
        .at(0);
      if (!editor) {
        return '';
      }
      editor.element.focus?.();
      const selection = window.getSelection?.();
      if (selection && editor.element instanceof HTMLElement) {
        const range = document.createRange();
        range.selectNodeContents(editor.element);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      for (const event of [
        new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, metaKey: true, bubbles: true, cancelable: true }),
        new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, metaKey: true, bubbles: true, cancelable: true }),
        new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }),
        new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }),
      ]) {
        editor.element.dispatchEvent(event);
      }
      return 'clicked-dom-shortcut';
    })()`,
  );
  if (shortcut.startsWith("clicked-dom-shortcut")) {
    return shortcut;
  }
  const point = await evaluateCdpValue(
    webSocketDebuggerUrl,
    `(() => {
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const labeled = [...document.querySelectorAll('button, [role="button"], [aria-label], [title]')]
        .map((element) => {
          const text = [
            element.getAttribute('aria-label'),
            element.getAttribute('title'),
            element.textContent,
          ].filter(Boolean).join(' ');
          return { element, text, rect: element.getBoundingClientRect() };
        })
        .filter(({ element, text }) => visible(element) && /\\b(send|submit)\\b/i.test(text))
        .sort((left, right) => right.rect.top - left.rect.top || right.rect.left - left.rect.left);
      const labeledCandidate = labeled.at(0);
      if (labeledCandidate) {
        return {
          x: Math.round(labeledCandidate.rect.left + labeledCandidate.rect.width / 2),
          y: Math.round(labeledCandidate.rect.top + labeledCandidate.rect.height / 2),
        };
      }

      const wrapper =
        document.querySelector('.composer-input-blur-wrapper') ||
        document.querySelector('.composer-bar');
      if (wrapper) {
        const wrapperRect = wrapper.getBoundingClientRect();
        const wrapperCandidates = [...wrapper.querySelectorAll('button, [role="button"]')]
          .map((element) => ({
            element,
            text: [
              element.getAttribute('aria-label'),
              element.getAttribute('title'),
              element.textContent,
            ].filter(Boolean).join(' ').replace(/\\s+/g, ' ').trim(),
            rect: element.getBoundingClientRect(),
          }))
          .filter(({ element, text, rect }) =>
            visible(element) &&
            rect.left >= wrapperRect.right - 140 &&
            rect.top >= wrapperRect.bottom - 80 &&
            rect.top <= wrapperRect.bottom + 12 &&
            !isBlockedControlText(text) &&
            !/\\b(agent|model|local-qwen|gpt|composer|plan|build)\\b/i.test(text)
          )
          .sort((left, right) => right.rect.left - left.rect.left || right.rect.top - left.rect.top);
        const wrapperCandidate = wrapperCandidates.at(0);
        if (wrapperCandidate) {
          return {
            x: Math.round(wrapperCandidate.rect.left + wrapperCandidate.rect.width / 2),
            y: Math.round(wrapperCandidate.rect.top + wrapperCandidate.rect.height / 2),
          };
        }
        return {
          x: Math.round(wrapperRect.right - 24),
          y: Math.round(wrapperRect.bottom - 24),
        };
      }

      const editors = [...document.querySelectorAll('textarea, input, [contenteditable="true"]')]
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ element, rect }) => {
          const tag = element.tagName.toLowerCase();
          return visible(element) && rect.width >= 100 && rect.height >= 10 && (tag !== 'input' || element.getAttribute('type') !== 'checkbox');
        })
        .sort((left, right) => {
          const leftEditable = left.element.getAttribute('contenteditable') === 'true' ? 1 : 0;
          const rightEditable = right.element.getAttribute('contenteditable') === 'true' ? 1 : 0;
          return rightEditable - leftEditable || right.rect.width * right.rect.height - left.rect.width * left.rect.height;
        });
      const editor = editors.at(0);
      if (!editor) {
        return false;
      }
      const candidates = [...document.querySelectorAll('button, [role="button"]')]
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ element, rect }) =>
          visible(element) &&
          rect.left >= editor.rect.right - 220 &&
          rect.top >= editor.rect.top - 60 &&
          rect.top <= editor.rect.bottom + 120
        )
        .sort((left, right) => right.rect.left - left.rect.left || right.rect.top - left.rect.top);
      const candidate = candidates.at(0);
      if (!candidate) {
        return undefined;
      }
      return {
        x: Math.round(candidate.rect.left + candidate.rect.width / 2),
        y: Math.round(candidate.rect.top + candidate.rect.height / 2),
      };
    })()`,
  );
  if (
    typeof point !== "object" ||
    point === null ||
    typeof (point as { x?: unknown }).x !== "number" ||
    typeof (point as { y?: unknown }).y !== "number"
  ) {
    return `not-clicked:${directClick || "no-target"}`;
  }
  const { x, y } = point as { x: number; y: number };
  await cdpCommand(webSocketDebuggerUrl, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await cdpCommand(webSocketDebuggerUrl, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  return `clicked-coordinates:${x},${y}`;
}

async function waitForDesktopPromptResult(
  webSocketDebuggerUrl: string,
  timeoutMs: number,
): Promise<string> {
  const started = Date.now();
  let text = "";
  while (Date.now() - started < timeoutMs) {
    text = await evaluateCdpString(
      webSocketDebuggerUrl,
      "document.body?.innerText ?? ''",
    );
    if (
      text.includes("desktop-probe-ok") ||
      text.includes("AI Model Not Found") ||
      text.includes("Model name is not valid")
    ) {
      return text;
    }
    await delay(500);
  }
  return text;
}

function desktopPickerHasBuiltInModel(text: string): boolean {
  return [
    "Auto",
    "Composer",
    "Fable",
    "Opus",
    "GPT-",
    "Claude",
    "Sonnet",
    "Gemini",
    "Codex",
  ].some((modelText) => text.includes(modelText));
}

async function desktopComposerDomVisible(
  webSocketDebuggerUrl: string,
): Promise<boolean> {
  const visible = await evaluateCdpValue(
    webSocketDebuggerUrl,
    `(() => {
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      return [
        '.composer-input-blur-wrapper .aislash-editor-input',
        '.composer-input-blur-wrapper textarea',
        '.composer-input-blur-wrapper',
        '.composer-bar',
      ].some((selector) => {
        const element = document.querySelector(selector);
        return element !== null && isVisible(element);
      });
    })()`,
  );
  return visible === true;
}

function composerBodyTextVisible(text: string): boolean {
  const lowerText = text.toLowerCase();
  return (
    lowerText.includes("auto") ||
    lowerText.includes("gpt-") ||
    lowerText.includes("local-qwen") ||
    lowerText.includes("claude") ||
    lowerText.includes("composer") ||
    lowerText.includes("fable") ||
    lowerText.includes("opus") ||
    lowerText.includes("gemini")
  );
}

function composerPromptVisible(text: string): boolean {
  return (
    text.includes("Plan, Build") ||
    text.includes("Plan, search") ||
    text.includes("Plan, build") ||
    text.includes("Agent")
  );
}

async function clickVisibleModelPickerTrigger(
  webSocketDebuggerUrl: string,
): Promise<string | undefined> {
  const result = await evaluateCdpValue(
    webSocketDebuggerUrl,
    `(() => {
      const patterns = [
        /^Auto$/i,
        /^GPT[-\\w.\\s]+$/i,
        /^Claude[\\w.\\s-]*$/i,
        /^Composer[\\w.\\s-]*$/i,
        /^Fable[\\w.\\s-]*$/i,
        /^Opus[\\w.\\s-]*$/i,
        /^Gemini[\\w.\\s-]*$/i,
        /^local[-\\w.\\s]*$/i,
      ];
      const candidates = [...document.querySelectorAll("*")]
        .map((element) => {
          const text = (element.innerText || element.textContent || "").trim();
          const rect = element.getBoundingClientRect();
          return { element, text, rect };
        })
        .filter(({ text, rect }) =>
          text.length > 0 &&
          text.length < 80 &&
          rect.width > 0 &&
          rect.height > 0 &&
          patterns.some((pattern) => pattern.test(text))
        )
        .sort((left, right) => left.rect.top - right.rect.top);
      const candidate = candidates.at(-1);
      if (!candidate) {
        return undefined;
      }
      candidate.element.click();
      return candidate.text;
    })()`,
  );
  return typeof result === "string" ? result : undefined;
}

async function evaluateCdpStringArray(
  webSocketDebuggerUrl: string,
  expression: string,
): Promise<string[]> {
  const value = await evaluateCdpValue(webSocketDebuggerUrl, expression);
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

async function waitForCdpBodyText(
  webSocketDebuggerUrl: string,
  timeoutMs: number,
): Promise<string> {
  const started = Date.now();
  let text = "";
  while (Date.now() - started < timeoutMs) {
    text = await evaluateCdpString(
      webSocketDebuggerUrl,
      "document.body?.innerText ?? ''",
    );
    if (text.trim().length > 0) {
      return text;
    }
    await delay(250);
  }
  return text;
}

async function clickVisibleText(
  webSocketDebuggerUrl: string,
  label: string,
): Promise<boolean> {
  const result = await evaluateCdpValue(
    webSocketDebuggerUrl,
    `(() => {
      const label = ${JSON.stringify(label)};
      const elements = [...document.querySelectorAll("*")]
        .filter((element) => {
          const text = (element.innerText || element.textContent || "").trim();
          const rect = element.getBoundingClientRect();
          return text === label && rect.width > 0 && rect.height > 0;
        });
      const element = elements.at(-1);
      if (!element) {
        return false;
      }
      element.click();
      return true;
    })()`,
  );
  return result === true;
}

async function evaluateCdpString(
  webSocketDebuggerUrl: string,
  expression: string,
): Promise<string> {
  const value = await evaluateCdpValue(webSocketDebuggerUrl, expression);
  return typeof value === "string" ? value : "";
}

async function evaluateCdpValue(
  webSocketDebuggerUrl: string,
  expression: string,
): Promise<unknown> {
  const response = await cdpCommand(webSocketDebuggerUrl, "Runtime.evaluate", {
    expression,
    returnByValue: true,
  });
  const result = response.result as
    | { result?: { value?: unknown } }
    | undefined;
  return result?.result?.value;
}

async function cdpCommand(
  webSocketDebuggerUrl: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map<number, (value: Record<string, unknown>) => void>();
  socket.addEventListener("message", (event) => {
    const parsed = JSON.parse(String(event.data)) as Record<string, unknown>;
    const id = typeof parsed.id === "number" ? parsed.id : undefined;
    if (id === undefined) {
      return;
    }
    const resolve = pending.get(id);
    if (resolve === undefined) {
      return;
    }
    pending.delete(id);
    resolve(parsed);
  });
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error("CDP socket error")),
      { once: true },
    );
  });
  try {
    const id = nextId;
    nextId += 1;
    socket.send(
      JSON.stringify({
        id,
        method,
        params,
      }),
    );
    return await new Promise<Record<string, unknown>>((resolve) => {
      pending.set(id, resolve);
    });
  } finally {
    socket.close();
  }
}

function parseAgentRunDiagnostics(
  logText: string,
): AgentRunDiagnosticSummary[] {
  const summaries: AgentRunDiagnosticSummary[] = [];
  for (const line of logText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (parsed.message !== "local agent run diagnostics") {
        continue;
      }
      summaries.push({
        modelId: stringField(parsed.modelId),
        promptLength: numberField(parsed.promptLength),
        customSystemPromptLength: numberField(parsed.customSystemPromptLength),
        promptContextNodes: numberField(parsed.promptContextNodes),
        inlinePromptContextNodes: numberField(parsed.inlinePromptContextNodes),
        inlinePromptContextCharacters: numberField(
          parsed.inlinePromptContextCharacters,
        ),
        mcpToolCount: numberField(parsed.mcpToolCount),
        mcpToolNames: stringArrayField(parsed.mcpToolNames),
        hasMcpFileSystemOptions: booleanField(parsed.hasMcpFileSystemOptions),
        hasSkillOptions: booleanField(parsed.hasSkillOptions),
        excludeWorkspaceContext: booleanField(parsed.excludeWorkspaceContext),
        preFetchedBlobCount: numberField(parsed.preFetchedBlobCount),
        injectedContextMessages: numberField(parsed.injectedContextMessages),
      });
    } catch {
      continue;
    }
  }
  return summaries;
}

function trafficFailureCode(report: {
  listModels: TrafficProcessSummary;
  prompt: TrafficProcessSummary;
  routeInventory: ReturnType<typeof analyzeRouteInventoryLog>;
  listedModel: boolean;
  completedPrompt: boolean;
}): FailureCode | undefined {
  if (report.listModels.exitCode !== 0) {
    return "model_metadata_rejected";
  }
  if (!report.routeInventory.routeInventorySeen) {
    return "route_missing";
  }
  if (report.routeInventory.modelRoutesSeen.length === 0) {
    return "model_route_missing";
  }
  if (!report.listedModel) {
    return "model_metadata_rejected";
  }
  if (report.prompt.exitCode !== 0 || !report.completedPrompt) {
    return "local_completion_failed";
  }
  return undefined;
}

function trafficFailureMessage(code: FailureCode): string {
  switch (code) {
    case "route_missing":
      return "cursor-agent traffic did not reach bridge route inventory";
    case "model_route_missing":
      return "cursor-agent reached the bridge, but known model routes were not observed";
    case "extension_host_route_missing":
      return "desktop extension-host agent traffic did not reach the bridge";
    case "model_metadata_rejected":
      return "cursor-agent did not list or accept the local model";
    case "local_completion_failed":
      return "cursor-agent listed the model, but a normal prompt did not complete through the local path";
    case "desktop_picker_missing":
    case "desktop_model_selection_missing":
    case "desktop_prompt_submission_failed":
    case "desktop_backend_request_missing":
    case "desktop_visible_response_missing":
      return code;
    case "backend_unreachable":
    case "bridge_start_failed":
    case "upstream_passthrough_failed":
    case "auth_profile_blocked":
    case "command_failed":
    case "timeout":
    case "not_available":
      return code;
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberField(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function booleanField(value: unknown): boolean {
  return typeof value === "boolean" ? value : false;
}

function stringArrayField(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function acpFailureCode(report: AcpProbeReport): FailureCode | undefined {
  if (!report.initialized || !report.authenticated || !report.sessionCreated) {
    return "auth_profile_blocked";
  }
  if (!report.routeInventory.routeInventorySeen) {
    return "route_missing";
  }
  if (report.routeInventory.modelRoutesSeen.length === 0) {
    return "model_route_missing";
  }
  if (
    !report.promptCompleted ||
    !report.textPreview.includes("traffic-probe-ok")
  ) {
    return "local_completion_failed";
  }
  return undefined;
}

function acpFailureMessage(code: FailureCode): string {
  switch (code) {
    case "auth_profile_blocked":
      return "ACP did not complete initialize/authenticate/session setup";
    case "route_missing":
      return "ACP traffic did not reach bridge route inventory";
    case "model_route_missing":
      return "ACP reached the bridge, but known model routes were not observed";
    case "extension_host_route_missing":
      return "desktop extension-host agent traffic did not reach the bridge";
    case "local_completion_failed":
      return "ACP session prompt did not complete through the local path";
    case "desktop_picker_missing":
    case "desktop_model_selection_missing":
    case "desktop_prompt_submission_failed":
    case "desktop_backend_request_missing":
    case "desktop_visible_response_missing":
      return code;
    case "backend_unreachable":
    case "bridge_start_failed":
    case "model_metadata_rejected":
    case "upstream_passthrough_failed":
    case "command_failed":
    case "timeout":
    case "not_available":
      return code;
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}
