import process from 'node:process';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import {
  SERVER_INSTRUCTIONS,
  SERVER_NAME,
  SERVER_VERSION,
} from './config/constants.js';
import { config } from './config/env.js';
import { ErrorCode, logger, McpError } from './lib/errors.js';
import { getLLMClient } from './lib/llm-client.js';
import { registerAllPrompts } from './prompts/index.js';
import { registerAllResources } from './resources/index.js';
import { registerAllTools } from './tools/index.js';

// Monitor Node.js warnings for deprecations and potential issues
process.on('warning', (warning) => {
  logger.warn(`Node.js warning: ${warning.name}`, {
    message: warning.message,
    code: (warning as NodeJS.ErrnoException).code,
  });
});

export async function validateApiKeys(): Promise<void> {
  const provider = config.LLM_PROVIDER;
  const providers = {
    openai: config.OPENAI_API_KEY,
    anthropic: config.ANTHROPIC_API_KEY,
    google: config.GOOGLE_API_KEY,
  };

  const activeKey = providers[provider];

  if (!activeKey) {
    const envVar =
      provider === 'openai'
        ? 'OPENAI_API_KEY'
        : provider === 'anthropic'
          ? 'ANTHROPIC_API_KEY'
          : 'GOOGLE_API_KEY';

    // Only throw specific error if it's a known provider, otherwise let getLLMClient handle invalid provider
    if (['openai', 'anthropic', 'google'].includes(provider)) {
      throw new McpError(
        ErrorCode.E_INVALID_INPUT,
        `❌ API key is REQUIRED for provider "${provider}". Set ${envVar}.`
      );
    }
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
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info(`${SERVER_NAME} v${SERVER_VERSION} started`);
}
