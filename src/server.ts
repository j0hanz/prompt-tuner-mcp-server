import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import {
  SERVER_INSTRUCTIONS,
  SERVER_NAME,
  SERVER_VERSION,
} from './config/constants.js';
import { ErrorCode, logger, McpError } from './lib/errors.js';
import { getLLMClient } from './lib/llm-client.js';
import { registerAllPrompts } from './prompts/index.js';
import { registerAllResources } from './resources/index.js';
import { registerAllTools } from './tools/index.js';

async function validateApiKeys(): Promise<void> {
  const provider = process.env.LLM_PROVIDER ?? 'openai';
  const providers = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    google: process.env.GOOGLE_API_KEY,
  };

  const hasAnyKey = Object.values(providers).some((key) => key !== undefined);

  if (!hasAnyKey) {
    throw new McpError(
      ErrorCode.E_INVALID_INPUT,
      `❌ API key is REQUIRED. Set one of: OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY`
    );
  }

  // Validate the configured provider has a key
  try {
    const client = await getLLMClient();
    logger.info(
      `✅ API key validated: ${client.getProvider()} (${client.getModel()})`
    );
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.E_LLM_FAILED,
      `❌ Failed to initialize LLM client for provider: ${provider}. Check your API key.`
    );
  }
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
        resources: { subscribe: false, listChanged: true },
        prompts: { listChanged: true },
      },
    }
  );

  registerAllTools(server);
  registerAllResources(server);
  registerAllPrompts(server);

  return server;
}

export async function startServer(server: McpServer): Promise<void> {
  // Validate API keys before connecting - REQUIRED
  await validateApiKeys();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info(`${SERVER_NAME} v${SERVER_VERSION} started`);
}
