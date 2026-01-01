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
import { registerAllPrompts } from './prompts/index.js';
import { registerTemplateResources } from './resources/templates.js';
import { registerAnalyzePromptTool } from './tools/analyze-prompt.js';
import { registerOptimizePromptTool } from './tools/optimize-prompt.js';
import { registerRefinePromptTool } from './tools/refine-prompt.js';
import { registerValidatePromptTool } from './tools/validate-prompt.js';

process.on('warning', (warning) => {
  const code = 'code' in warning ? warning.code : undefined;
  logger.warn(
    { message: warning.message, code },
    `Node.js warning: ${warning.name}`
  );
});

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
        resources: { listChanged: true },
        tools: { listChanged: true },
        prompts: { listChanged: true },
      },
    }
  );

  registerRefinePromptTool(server);
  registerAnalyzePromptTool(server);
  registerOptimizePromptTool(server);
  registerValidatePromptTool(server);
  registerTemplateResources(server);
  registerAllPrompts(server);

  return server;
}

export async function startServer(): Promise<McpServer> {
  const server = createServer();
  await server.connect(new StdioServerTransport());

  logger.info(
    `${styleText('green', SERVER_NAME)} v${styleText('blue', SERVER_VERSION)} started`
  );

  return server;
}
