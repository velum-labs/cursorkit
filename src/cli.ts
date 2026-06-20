#!/usr/bin/env node
import { Command } from "commander";

import { registerCk } from "./ckLauncher.js";
import { registerDoctor } from "./commands/doctor.js";
import { registerMaintenance } from "./commands/maintenance.js";
import { registerServe } from "./commands/serve.js";

const ENV_HELP = `
Environment:
  BRIDGE_HOST=127.0.0.1
  BRIDGE_PORT=9443
  CURSOR_UPSTREAM_BASE_URL=https://example.cursor-backend.local
  MODEL_BASE_URL=http://localhost:8080/v1
  MODEL_NAME=local-model`;

export function buildCursorkitProgram(): Command {
  const program = new Command();
  program
    .name("cursorkit")
    .description("local model bridge for Cursor")
    .addHelpText("after", ENV_HELP);

  registerServe(program);
  registerDoctor(program);
  registerMaintenance(program);
  registerCk(program);

  return program;
}

async function main(): Promise<void> {
  const program = buildCursorkitProgram();
  if (process.argv.slice(2).length === 0) {
    program.outputHelp();
    return;
  }
  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
