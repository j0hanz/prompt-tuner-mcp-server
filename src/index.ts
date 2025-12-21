#!/usr/bin/env node
import { logger } from './lib/errors.js';
import { createServer, startServer, validateApiKeys } from './server.js';

async function main(): Promise<void> {
  // Validate API keys first to fail fast
  await validateApiKeys();
  const server = createServer();
  await startServer(server);
}

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

main().catch((error: unknown) => {
  logger.error(
    'Fatal error:',
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
});
