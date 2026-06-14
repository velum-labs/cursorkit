import type {
  ArtifactWriter,
  HarnessOptions,
  HarnessSuite,
  HarnessSuiteInput,
  ProcessRunner,
  Scenario,
  ScenarioContext,
  ScenarioResult,
} from "./types.js";

export class ScenarioRunner {
  constructor(
    private readonly scenarios: Scenario[],
    private readonly artifacts: ArtifactWriter,
    private readonly processRunner: ProcessRunner,
  ) {}

  async run(options: HarnessOptions): Promise<ScenarioResult[]> {
    const suites = expandSuites(options.suites, options);
    const selected = this.scenarios.filter((scenario) =>
      suites.includes(scenario.suite),
    );
    const context: ScenarioContext = {
      options,
      artifacts: this.artifacts,
      processRunner: this.processRunner,
    };
    const results: ScenarioResult[] = [];
    for (const scenario of selected) {
      const started = Date.now();
      try {
        results.push(await scenario.run(context));
      } catch (error) {
        results.push({
          id: scenario.id,
          suite: scenario.suite,
          status: "failed",
          durationMs: Date.now() - started,
          message: error instanceof Error ? error.message : String(error),
          failureCode: "command_failed",
        });
      }
    }
    return results;
  }
}

export function expandSuites(
  inputs: HarnessSuiteInput[],
  options: Pick<HarnessOptions, "includeExperimental">,
): HarnessSuite[] {
  const expanded: HarnessSuite[] = [];
  for (const input of inputs.length === 0 ? ["all" as const] : inputs) {
    switch (input) {
      case "all":
        pushUnique(expanded, "static");
        pushUnique(expanded, "bridge-protocol");
        pushUnique(expanded, "cursor-agent");
        if (options.includeExperimental) {
          pushUnique(expanded, "cursor-agent-acp-experimental");
          pushUnique(expanded, "desktop-ui-experimental");
        }
        break;
      case "acp":
        pushUnique(expanded, "cursor-agent-acp-experimental");
        break;
      case "cli":
        pushUnique(expanded, "cursor-agent");
        break;
      case "traffic":
        pushUnique(expanded, "cursor-agent-traffic");
        break;
      case "desktop":
        pushUnique(expanded, "desktop-route");
        break;
      case "static":
      case "bridge-protocol":
      case "local-backend":
      case "cursor-agent":
      case "cursor-agent-traffic":
      case "cursor-agent-acp-experimental":
      case "desktop-route":
      case "desktop-ui-experimental":
        pushUnique(expanded, input);
        break;
      default: {
        const exhaustive: never = input;
        throw new Error(`Unhandled suite: ${exhaustive}`);
      }
    }
  }
  return expanded;
}

function pushUnique(suites: HarnessSuite[], suite: HarnessSuite): void {
  if (!suites.includes(suite)) {
    suites.push(suite);
  }
}
