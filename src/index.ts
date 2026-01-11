#!/usr/bin/env node
import { applyEnvOverrides, parseCli, printHelp } from './cli/config.js';
import { initLogger } from './cli/logger.js';
import { writeCliOutput } from './cli/output.js';
import {
  registerProcessHandlers,
  setServer,
  shutdown,
} from './cli/shutdown.js';
import { configureTelemetry } from './cli/telemetry.js';

registerProcessHandlers();

async function main(): Promise<void> {
  const cli = parseCli();
  applyEnvOverrides(cli);

  if (cli.help) {
    printHelp();
    return;
  }

  if (cli.version) {
    const { SERVER_NAME, SERVER_VERSION } =
      await import('./config/constants.js');
    writeCliOutput(`${SERVER_NAME} v${SERVER_VERSION}`);
    return;
  }

  await initLogger();

  const cleanupTelemetry = await configureTelemetry();
  process.once('exit', () => {
    cleanupTelemetry();
  });

  const { getLLMClient } = await import('./lib/llm-client.js');
  const { startServer } = await import('./server.js');

  await getLLMClient();
  const server = await startServer();
  setServer(server);
}

main().catch((err: unknown) => {
  void shutdown('startup', err);
});
