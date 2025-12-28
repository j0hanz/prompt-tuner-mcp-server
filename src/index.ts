#!/usr/bin/env node
import { logger } from './lib/errors.js';
import { createServer, startServer, validateApiKeys } from './server.js';

const SHUTDOWN_DELAY_MS = 500;
const SIGNALS: NodeJS.Signals[] = [
  'SIGHUP',
  'SIGINT',
  'SIGQUIT',
  'SIGILL',
  'SIGTRAP',
  'SIGABRT',
  'SIGBUS',
  'SIGFPE',
  'SIGSEGV',
  'SIGUSR2',
  'SIGTERM',
];
const ERROR_EVENTS = ['uncaughtException', 'unhandledRejection'] as const;
const EXIT_EVENTS = ['beforeExit'] as const;
type ExitEvent = (typeof EXIT_EVENTS)[number] | 'stdin_end' | 'stdin_close';
interface ShutdownReason {
  signal?: NodeJS.Signals;
  err?: unknown;
  event?: ExitEvent;
}

let shuttingDown = false;
let server: ReturnType<typeof createServer> | null = null;

function logSecondShutdown(reason: ShutdownReason): void {
  if (reason.signal) {
    logger.error({ signal: reason.signal }, `Second ${reason.signal}, exiting`);
    return;
  }
  if (reason.err) {
    logger.error({ err: reason.err }, 'Second error, exiting');
    return;
  }
  logger.error('Second shutdown event, exiting');
}

function logShutdownStart(reason: ShutdownReason): void {
  if (reason.err) {
    logger.error({ err: reason.err }, 'Server closing due to error');
  }
  if (reason.signal) {
    logger.info({ signal: reason.signal }, 'Server shutting down gracefully');
  }
  if (reason.event) {
    logger.info({ event: reason.event }, 'Server shutting down gracefully');
  }
}

function resolveExitCode(reason: ShutdownReason): number {
  return reason.err ? 1 : 0;
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

async function closeServerIfConnected(): Promise<void> {
  if (server?.isConnected()) {
    await server.close();
  }
}

async function beginShutdown(reason: ShutdownReason): Promise<void> {
  if (shuttingDown) {
    logSecondShutdown(reason);
    process.exit(1);
    return;
  }

  shuttingDown = true;
  logShutdownStart(reason);

  let exitCode = resolveExitCode(reason);
  const timeout = startForcedShutdownTimer();

  try {
    await closeServerIfConnected();
  } catch (error) {
    exitCode = 1;
    logger.error({ err: error }, 'Error during shutdown');
  } finally {
    clearTimeout(timeout);
    process.exit(exitCode);
  }
}

for (const signal of SIGNALS) {
  process.once(signal, (received) => {
    void beginShutdown({ signal: received });
  });
}
for (const event of ERROR_EVENTS) {
  process.once(event, (err) => {
    void beginShutdown({ err });
  });
}
for (const event of EXIT_EVENTS) {
  process.once(event, () => {
    void beginShutdown({ event });
  });
}
process.stdin.once('end', () => {
  void beginShutdown({ event: 'stdin_end' });
});
process.stdin.once('close', () => {
  void beginShutdown({ event: 'stdin_close' });
});

async function main(): Promise<void> {
  await validateApiKeys();
  server = createServer();
  await startServer(server);
}

main().catch((error: unknown) => {
  void beginShutdown({ err: error });
});
