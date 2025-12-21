#!/usr/bin/env node
import closeWithGrace from 'close-with-grace';

import { logger } from './lib/errors.js';
import { createServer, startServer, validateApiKeys } from './server.js';

async function main(): Promise<void> {
  await validateApiKeys();
  const server = createServer();
  await startServer(server);
}

closeWithGrace({ delay: 500 }, ({ signal, err }) => {
  if (err) logger.error({ err }, 'Server closing due to error');
  logger.info({ signal }, 'Server shutting down gracefully');
});

main().catch((error: unknown) => {
  logger.error({ err: error }, 'Fatal error');
  process.exit(1);
});
