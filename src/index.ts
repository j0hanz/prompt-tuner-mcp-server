#!/usr/bin/env node
import {
  applyEnvOverrides,
  configureTelemetry,
  initLogger,
  parseCli,
  printHelp,
  registerProcessHandlers,
  setServer,
  shutdown,
  writeCliOutput,
} from './cli.js';

registerProcessHandlers();

async function main(): Promise<void> {
  const cli = parseCli();
  applyEnvOverrides(cli);

  if (cli.help) {
    printHelp();
    return;
  }

  if (cli.version) {
    const { SERVER_NAME, SERVER_VERSION } = await import('./config.js');
    writeCliOutput(`${SERVER_NAME} v${SERVER_VERSION}`);
    return;
  }

  await initLogger();

  const cleanupTelemetry = await configureTelemetry();
  process.once('exit', () => {
    cleanupTelemetry();
  });

  const { getLLMClient } = await import('./lib/llm.js');
  const { startServer } = await import('./server.js');

  await getLLMClient();
  const server = await startServer();
  setServer(server);
}

main().catch((err: unknown) => {
  void shutdown('startup', err);
});
