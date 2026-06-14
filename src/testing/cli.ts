#!/usr/bin/env node
import path from "node:path";

import {
  FileArtifactStore,
  createRunDirectory,
  writeRunSummary,
} from "./artifacts.js";
import { ChildProcessRunner } from "./processRunner.js";
import { ScenarioRunner } from "./runner.js";
import { createScenarios } from "./scenarios.js";
import type { HarnessOptions, HarnessSuiteInput } from "./types.js";

const HELP = `cursor-rpc test harness

Usage:
  pnpm test:harness -- --suite static
  pnpm test:harness -- --suite traffic
  pnpm test:harness -- --suite acp
  pnpm test:harness -- --suite local-backend --base-url http://127.0.0.1:8080/v1 --model mlx-community/Qwen3.5-4B-8bit
  pnpm test:harness -- --suite desktop --use-default-profile --timeout-ms 30000

Options:
  --suite <name>              Suite to run; repeat or comma-separate. Values: all, static, bridge-protocol, local-backend, cursor-agent, cursor-agent-traffic, traffic, acp, cli, desktop, desktop-route
  --base-url <url>            OpenAI-compatible base URL
  --model <id>                Model ID for local backend/desktop scenarios
  --provider-model <id>       OpenAI-compatible backend model ID when different from --model
  --display-name <name>       Cursor-facing display name
  --api-key <key>             API key for local backend requests
  --timeout-ms <ms>           Per-scenario timeout
  --use-default-profile       Desktop: reuse signed-in Cursor profile
  --include-experimental      Include ACP/UI experimental suites with all
  --artifacts-dir <path>      Artifact output directory
`;

export function parseHarnessArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): HarnessOptions {
  const suites: HarnessSuiteInput[] = [];
  let baseUrl = env.MODEL_BASE_URL ?? "http://127.0.0.1:8080/v1";
  let model = env.MODEL_NAME ?? "mlx-community/Qwen3.5-4B-8bit";
  let providerModel = env.MODEL_PROVIDER_MODEL ?? model;
  let providerModelExplicit = env.MODEL_PROVIDER_MODEL !== undefined;
  let displayName = env.MODEL_DISPLAY_NAME ?? "local-qwen";
  let apiKey = env.MODEL_API_KEY ?? "local";
  let timeoutMs = 30_000;
  let useDefaultProfile = false;
  let includeExperimental = false;
  let artifactsDir: string | undefined;

  const args = argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--":
        break;
      case "--suite": {
        const value = requiredValue(args, index, arg);
        suites.push(...parseSuites(value));
        index += 1;
        break;
      }
      case "--base-url":
        baseUrl = requiredValue(args, index, arg);
        index += 1;
        break;
      case "--model":
        model = requiredValue(args, index, arg);
        if (!providerModelExplicit) {
          providerModel = model;
        }
        index += 1;
        break;
      case "--provider-model":
        providerModel = requiredValue(args, index, arg);
        providerModelExplicit = true;
        index += 1;
        break;
      case "--display-name":
        displayName = requiredValue(args, index, arg);
        index += 1;
        break;
      case "--api-key":
        apiKey = requiredValue(args, index, arg);
        index += 1;
        break;
      case "--timeout-ms":
        timeoutMs = parsePositiveInteger(requiredValue(args, index, arg), arg);
        index += 1;
        break;
      case "--use-default-profile":
        useDefaultProfile = true;
        break;
      case "--include-experimental":
        includeExperimental = true;
        break;
      case "--artifacts-dir":
        artifactsDir = requiredValue(args, index, arg);
        index += 1;
        break;
      case "--help":
      case "-h":
        throw new HelpRequested();
      default:
        throw new Error(`Unknown harness argument: ${arg}\n\n${HELP}`);
    }
  }

  return {
    suites: suites.length > 0 ? suites : ["all"],
    cwd,
    artifactsDir,
    baseUrl,
    model,
    providerModel,
    displayName,
    apiKey,
    timeoutMs,
    useDefaultProfile,
    includeExperimental,
    env,
  };
}

export async function runHarnessCli(argv = process.argv): Promise<number> {
  let options: HarnessOptions;
  try {
    options = parseHarnessArgs(argv);
  } catch (error) {
    if (error instanceof HelpRequested) {
      console.log(HELP);
      return 0;
    }
    throw error;
  }

  const runDir = createRunDirectory({
    cwd: options.cwd,
    artifactsDir: options.artifactsDir,
  });
  const artifacts = new FileArtifactStore(runDir);
  const processRunner = new ChildProcessRunner(options.cwd, artifacts);
  const runner = new ScenarioRunner(
    createScenarios(),
    artifacts,
    processRunner,
  );
  const results = await runner.run(options);
  const summaryPaths = writeRunSummary(artifacts, results);

  printSummary(results, summaryPaths.json);
  return results.some((result) => result.status === "failed") ? 1 : 0;
}

class HelpRequested extends Error {}

function parseSuites(value: string): HarnessSuiteInput[] {
  return value
    .split(",")
    .map((suite) => suite.trim())
    .filter((suite) => suite.length > 0)
    .map((suite) => {
      if (isHarnessSuiteInput(suite)) {
        return suite;
      }
      throw new Error(`Unknown suite: ${suite}`);
    });
}

function isHarnessSuiteInput(value: string): value is HarnessSuiteInput {
  return [
    "all",
    "acp",
    "cli",
    "desktop",
    "static",
    "bridge-protocol",
    "local-backend",
    "cursor-agent",
    "cursor-agent-traffic",
    "cursor-agent-acp-experimental",
    "desktop-route",
    "desktop-ui-experimental",
    "traffic",
  ].includes(value);
}

function requiredValue(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function printSummary(
  results: Array<{ id: string; status: string; message: string }>,
  summaryPath: string,
): void {
  console.log("Harness Summary");
  for (const result of results) {
    console.log(
      `${result.status.toUpperCase()} ${result.id}: ${result.message}`,
    );
  }
  console.log(`Artifacts: ${path.dirname(summaryPath)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runHarnessCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
