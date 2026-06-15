export type HarnessSuite =
  | "static"
  | "bridge-protocol"
  | "local-backend"
  | "cursor-agent"
  | "cursor-agent-traffic"
  | "cursor-agent-acp-experimental"
  | "desktop-route"
  | "desktop-ui-experimental";

export type HarnessSuiteInput =
  | HarnessSuite
  | "all"
  | "acp"
  | "cli"
  | "desktop"
  | "traffic";

export type ScenarioStatus = "passed" | "failed" | "skipped";

export type FailureCode =
  | "backend_unreachable"
  | "bridge_start_failed"
  | "route_missing"
  | "model_route_missing"
  | "extension_host_route_missing"
  | "desktop_picker_missing"
  | "desktop_model_selection_missing"
  | "desktop_prompt_submission_failed"
  | "desktop_backend_request_missing"
  | "desktop_visible_response_missing"
  | "model_metadata_rejected"
  | "local_completion_failed"
  | "upstream_passthrough_failed"
  | "auth_profile_blocked"
  | "command_failed"
  | "timeout"
  | "not_available";

export interface HarnessOptions {
  suites: HarnessSuiteInput[];
  cwd: string;
  artifactsDir?: string;
  baseUrl: string;
  model: string;
  providerModel: string;
  displayName: string;
  apiKey: string;
  timeoutMs: number;
  useDefaultProfile: boolean;
  includeExperimental: boolean;
  env: NodeJS.ProcessEnv;
}

export interface ScenarioResult {
  id: string;
  suite: HarnessSuite;
  status: ScenarioStatus;
  durationMs: number;
  message: string;
  failureCode?: FailureCode;
  artifacts?: Record<string, string>;
  details?: Record<string, unknown>;
}

export interface Scenario {
  id: string;
  suite: HarnessSuite;
  description: string;
  run(context: ScenarioContext): Promise<ScenarioResult>;
}

export interface ScenarioContext {
  options: HarnessOptions;
  artifacts: ArtifactWriter;
  processRunner: ProcessRunner;
}

export interface ArtifactWriter {
  rootDir: string;
  pathFor(name: string): string;
  writeText(name: string, contents: string): string;
  writeJson(name: string, contents: unknown): string;
}

export interface ProcessRunOptions {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  logName: string;
}

export interface ProcessRunResult {
  command: string;
  args: string[];
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  logPath: string;
}

export interface ProcessRunner {
  run(options: ProcessRunOptions): Promise<ProcessRunResult>;
}
