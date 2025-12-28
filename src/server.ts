import process from 'node:process';
import { styleText } from 'node:util';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import {
  SERVER_INSTRUCTIONS,
  SERVER_NAME,
  SERVER_VERSION,
} from './config/constants.js';
import { logger } from './lib/errors.js';
import { getLLMClient } from './lib/llm-client.js';
import { registerAllPrompts } from './prompts/index.js';
import { registerAllTools } from './tools/index.js';

// Monitor Node.js warnings for deprecations and potential issues
process.on('warning', (warning) => {
  const code = 'code' in warning ? warning.code : undefined;
  logger.warn(
    {
      message: warning.message,
      code,
    },
    `Node.js warning: ${warning.name}`
  );
});

export async function validateApiKeys(): Promise<void> {
  await getLLMClient();
}

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      instructions: SERVER_INSTRUCTIONS,
      capabilities: {
        logging: {},
        tools: { listChanged: true },
        prompts: { listChanged: true },
      },
    }
  );

  registerAllTools(server);
  registerAllPrompts(server);

  return server;
}

export async function startServer(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info(
    `${styleText('green', SERVER_NAME)} v${styleText('blue', SERVER_VERSION)} started`
  );
}
