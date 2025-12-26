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
type ExitEvent = (typeof EXIT_EVENTS)[number];

let shuttingDown = false;

function beginShutdown(reason: {
  signal?: NodeJS.Signals;
  err?: unknown;
  event?: ExitEvent;
}): void {
  if (shuttingDown) {
    if (reason.signal) {
      logger.error(
        { signal: reason.signal },
        `Second ${reason.signal}, exiting`
      );
    } else if (reason.err) {
      logger.error({ err: reason.err }, 'Second error, exiting');
    } else {
      logger.error('Second shutdown event, exiting');
    }
    process.exit(1);
  }

  shuttingDown = true;
  if (reason.err) {
    logger.error({ err: reason.err }, 'Server closing due to error');
  }
  if (reason.signal) {
    logger.info({ signal: reason.signal }, 'Server shutting down gracefully');
  }
  if (reason.event) {
    logger.info({ event: reason.event }, 'Server shutting down gracefully');
  }

  const exitCode = reason.err ? 1 : 0;
  const timeout = setTimeout(() => {
    logger.error(
      { delayMs: SHUTDOWN_DELAY_MS },
      'Forced shutdown due to timeout'
    );
    process.exit(1);
  }, SHUTDOWN_DELAY_MS);

  setImmediate(() => {
    clearTimeout(timeout);
    process.exit(exitCode);
  });
}

for (const signal of SIGNALS) {
  process.once(signal, (received) => {
    beginShutdown({ signal: received });
  });
}
for (const event of ERROR_EVENTS) {
  process.once(event, (err) => {
    beginShutdown({ err });
  });
}
for (const event of EXIT_EVENTS) {
  process.once(event, () => {
    beginShutdown({ event });
  });
}

async function main(): Promise<void> {
  await validateApiKeys();
  const server = createServer();
  await startServer(server);
}

main().catch((error: unknown) => {
  logger.error({ err: error }, 'Fatal error');
  process.exit(1);
});
