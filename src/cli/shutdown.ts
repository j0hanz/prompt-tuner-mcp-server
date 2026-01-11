import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { getLogger } from './logger.js';

const SHUTDOWN_DELAY_MS = 500;
const SIGNALS = ['SIGHUP', 'SIGINT', 'SIGTERM'] as const;

let server: McpServer | null = null;
let shuttingDown = false;

function logSecondShutdown(reason: string): void {
  const logger = getLogger();
  logger.error({ reason }, 'Second shutdown, exiting');
}

function logShutdown(reason: string, err?: unknown): void {
  const logger = getLogger();
  if (err) {
    logger.error({ err, reason }, 'Server shutting down due to error');
  } else {
    logger.info({ reason }, 'Server shutting down');
  }
}

function startForcedShutdownTimer(): NodeJS.Timeout {
  const logger = getLogger();
  return setTimeout(() => {
    logger.error(
      { delayMs: SHUTDOWN_DELAY_MS },
      'Forced shutdown due to timeout'
    );
    process.exit(1);
  }, SHUTDOWN_DELAY_MS);
}

async function closeServer(): Promise<boolean> {
  if (!server?.isConnected()) return true;
  try {
    await server.close();
    return true;
  } catch (closeError) {
    const logger = getLogger();
    logger.error({ err: closeError }, 'Error during shutdown');
    return false;
  }
}

export function setServer(instance: McpServer | null): void {
  server = instance;
}

export function registerProcessHandlers(): void {
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
}

export async function shutdown(reason: string, err?: unknown): Promise<void> {
  if (shuttingDown) {
    logSecondShutdown(reason);
    process.exit(1);
    return;
  }

  shuttingDown = true;
  logShutdown(reason, err);

  const timeout = startForcedShutdownTimer();
  let exitCode = err ? 1 : 0;
  if (!(await closeServer())) exitCode = 1;

  clearTimeout(timeout);
  process.exit(exitCode);
}
