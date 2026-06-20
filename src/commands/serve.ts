import type { Server } from "node:http";

import type { Command } from "commander";

import { loadConfig } from "../config.js";
import { desktopEnv } from "../desktop.js";
import { createLogger } from "../logger.js";
import { createBridgeRuntime, startServer } from "../server.js";
import { brandHeader, bold, dim, glyph, green, uiStream } from "../ui/index.js";

type Logger = ReturnType<typeof createLogger>;

function installGracefulShutdown(server: Server, logger: Logger): void {
  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      logger.warn("forcing bridge shutdown", { signal });
      process.exit(1);
    }
    shuttingDown = true;
    logger.info("shutting down bridge", { signal });
    const forceTimer = setTimeout(() => {
      logger.error("bridge shutdown timed out", { signal });
      process.exit(1);
    }, 5_000);
    server.close((error) => {
      clearTimeout(forceTimer);
      if (error !== undefined) {
        logger.error("bridge shutdown failed", { error: error.message });
        process.exitCode = 1;
      }
      process.exit();
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

async function startBridge(
  env: NodeJS.ProcessEnv,
  mode: "default" | "desktop",
): Promise<void> {
  const config = loadConfig(env);
  const logger = createLogger(config.logLevel);
  uiStream().write(
    `\n${brandHeader(mode === "desktop" ? "desktop proxy" : "bridge")}\n` +
      `${dim("bind:")} ${bold(`${config.host}:${config.port}`)}   ${dim("tls:")} ${config.useTls ? green(glyph.tick()) : "off"}\n\n`,
  );
  const runtime = await createBridgeRuntime(config, logger);
  installGracefulShutdown(await startServer(runtime), logger);
}

export function registerServe(program: Command): void {
  program
    .command("serve")
    .description("start the local bridge")
    .action(async () => {
      await startBridge(process.env, "default");
    });

  program
    .command("desktop-proxy")
    .description("start the bridge with Cursor desktop proxy defaults")
    .action(async () => {
      await startBridge(desktopEnv(process.env), "desktop");
    });
}
