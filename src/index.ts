#!/usr/bin/env node
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { logger } from './lib/errors.js';
import { startServer, validateApiKeys } from './server.js';

const SHUTDOWN_DELAY_MS = 500;
const SIGNALS = ['SIGHUP', 'SIGINT', 'SIGTERM'] as const;

let server: McpServer | null = null;
let shuttingDown = false;

function logSecondShutdown(reason: string): void {
  logger.error({ reason }, 'Second shutdown, exiting');
}

function logShutdown(reason: string, err?: unknown): void {
  if (err) {
    logger.error({ err, reason }, 'Server shutting down due to error');
    return;
  }
  logger.info({ reason }, 'Server shutting down');
}

function startForcedShutdownTimer(): NodeJS.Timeout {
  return setTimeout(() => {
    logger.error(
      { delayMs: SHUTDOWN_DELAY_MS },
      'Forced shutdown due to timeout'
    );
    process.exit(1);
  }, SHUTDOWN_DELAY_MS);
}

function resolveExitCode(err?: unknown): number {
  return err ? 1 : 0;
}

async function closeServer(exitCode: number): Promise<number> {
  if (!server?.isConnected()) return exitCode;

  try {
    await server.close();
    return exitCode;
  } catch (closeError) {
    logger.error({ err: closeError }, 'Error during shutdown');
    return 1;
  }
}

async function shutdown(reason: string, err?: unknown): Promise<void> {
  if (shuttingDown) {
    logSecondShutdown(reason);
    process.exit(1);
    return;
  }

  shuttingDown = true;
  logShutdown(reason, err);

  const timeout = startForcedShutdownTimer();
  const exitCode = await closeServer(resolveExitCode(err));

  clearTimeout(timeout);
  process.exit(exitCode);
}

for (const signal of SIGNALS) {
  process.once(signal, () => {
    void shutdown(signal);
  });
}

process.once('uncaughtException', (err) => {
  void shutdown('uncaughtException', err);
});
process.once('unhandledRejection', (err) => {
  void shutdown('unhandledRejection', err);
});

async function main(): Promise<void> {
  await validateApiKeys();
  server = await startServer();
}

main().catch((err: unknown) => {
  void shutdown('startup', err);
});
