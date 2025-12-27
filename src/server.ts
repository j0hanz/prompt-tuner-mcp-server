import process from 'node:process';
import { styleText } from 'node:util';

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
import { registerAllTools } from './tools/index.js';

const PROVIDER_ENV_KEYS = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
} as const;

// Monitor Node.js warnings for deprecations and potential issues
process.on('warning', (warning) => {
  logger.warn(
    {
      message: warning.message,
      code: (warning as NodeJS.ErrnoException).code,
    },
    `Node.js warning: ${warning.name}`
  );
});

function getProviderEnvKey(provider: string): string | null {
  if (provider in PROVIDER_ENV_KEYS) {
    return PROVIDER_ENV_KEYS[provider as keyof typeof PROVIDER_ENV_KEYS];
  }
  return null;
}

function getProviderKey(provider: string): string | undefined {
  if (provider === 'openai') return config.OPENAI_API_KEY;
  if (provider === 'anthropic') return config.ANTHROPIC_API_KEY;
  if (provider === 'google') return config.GOOGLE_API_KEY;
  return undefined;
}

function ensureProviderKey(provider: string): void {
  const envKey = getProviderEnvKey(provider);
  const activeKey = getProviderKey(provider);
  if (activeKey || !envKey) return;

  throw new McpError(
    ErrorCode.E_INVALID_INPUT,
    `❌ API key is REQUIRED for provider "${provider}". Set ${envKey}.`
  );
}

async function validateClient(provider: string): Promise<void> {
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

export async function validateApiKeys(): Promise<void> {
  const provider = config.LLM_PROVIDER;
  ensureProviderKey(provider);
  await validateClient(provider);
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
