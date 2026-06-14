import { spawn } from "node:child_process";

import type {
  ArtifactWriter,
  ProcessRunOptions,
  ProcessRunResult,
  ProcessRunner,
} from "./types.js";

export class ChildProcessRunner implements ProcessRunner {
  constructor(
    private readonly cwd: string,
    private readonly artifacts: ArtifactWriter,
  ) {}

  async run(options: ProcessRunOptions): Promise<ProcessRunResult> {
    const started = Date.now();
    const commandLine = [options.command, ...options.args].join(" ");
    const child = spawn(options.command, options.args, {
      cwd: this.cwd,
      env: mergeEnv(process.env, options.env ?? {}),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
          }, options.timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    const exit = await new Promise<{
      exitCode: number | null;
      signal: NodeJS.Signals | null;
    }>((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (exitCode, signal) => resolve({ exitCode, signal }));
    });
    if (timer !== undefined) {
      clearTimeout(timer);
    }

    const result: ProcessRunResult = {
      command: options.command,
      args: options.args,
      exitCode: exit.exitCode,
      signal: exit.signal,
      timedOut,
      durationMs: Date.now() - started,
      stdout,
      stderr,
      logPath: "",
    };
    result.logPath = this.artifacts.writeText(
      `logs/${options.logName}.log`,
      [
        `$ ${commandLine}`,
        "",
        "## stdout",
        stdout,
        "",
        "## stderr",
        stderr,
        "",
      ].join("\n"),
    );
    return result;
  }
}

function mergeEnv(
  base: NodeJS.ProcessEnv,
  overrides: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }
  return env;
}
