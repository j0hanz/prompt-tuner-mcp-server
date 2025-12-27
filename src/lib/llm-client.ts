import { DEFAULT_MODELS } from '../config/constants.js';
import { config } from '../config/env.js';
import type { LLMClient, LLMProvider } from '../config/types.js';
import { ErrorCode, logger, McpError } from './errors.js';
import {
  AnthropicClient,
  GoogleClient,
  OpenAIClient,
} from './llm-providers.js';

const PROVIDER_CONFIG = {
  openai: {
    envKey: 'OPENAI_API_KEY',
    defaultModel: DEFAULT_MODELS.openai,
    create: (apiKey: string, model: string) => new OpenAIClient(apiKey, model),
  },
  anthropic: {
    envKey: 'ANTHROPIC_API_KEY',
    defaultModel: DEFAULT_MODELS.anthropic,
    create: (apiKey: string, model: string) =>
      new AnthropicClient(apiKey, model),
  },
  google: {
    envKey: 'GOOGLE_API_KEY',
    defaultModel: DEFAULT_MODELS.google,
    create: (apiKey: string, model: string) => new GoogleClient(apiKey, model),
  },
} as const;

let llmClientPromise: Promise<LLMClient> | null = null;

function resolveApiKey(provider: LLMProvider): string | undefined {
  if (provider === 'openai') return config.OPENAI_API_KEY;
  if (provider === 'anthropic') return config.ANTHROPIC_API_KEY;
  return config.GOOGLE_API_KEY;
}

function createLLMClient(): LLMClient {
  const providerEnv = config.LLM_PROVIDER;
  const providerConfig = PROVIDER_CONFIG[providerEnv];
  const apiKey = resolveApiKey(providerEnv);

  if (!apiKey) {
    throw new McpError(
      ErrorCode.E_INVALID_INPUT,
      `Missing ${providerConfig.envKey} environment variable for provider: ${providerEnv}`
    );
  }

  const model = config.LLM_MODEL ?? providerConfig.defaultModel;
  return providerConfig.create(apiKey, model);
}

export async function getLLMClient(): Promise<LLMClient> {
  llmClientPromise ??= Promise.resolve()
    .then(() => {
      const client = createLLMClient();
      logger.info(
        `LLM client initialized: ${client.getProvider()} (${client.getModel()})`
      );
      return client;
    })
    .catch((error: unknown) => {
      llmClientPromise = null;
      throw error;
    });

  return llmClientPromise;
}

export async function getProviderInfo(): Promise<{
  provider: LLMProvider;
  model: string;
}> {
  const client = await getLLMClient();
  return { provider: client.getProvider(), model: client.getModel() };
}
