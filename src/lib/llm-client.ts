import Anthropic from '@anthropic-ai/sdk';

import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from '@google/genai';

import OpenAI from 'openai';

import invariant from 'tiny-invariant';

import { DEFAULT_MODELS, LLM_MAX_TOKENS } from '../config/constants.js';
import { config } from '../config/env.js';
import type {
  ErrorCodeType,
  LLMClient,
  LLMError,
  LLMProvider,
  LLMRequestOptions,
  SafeErrorDetails,
  ValidProvider,
} from '../config/types.js';
import { ErrorCode, logger, McpError } from './errors.js';
import { withRetry } from './retry.js';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getSafeErrorDetails(error: unknown): SafeErrorDetails {
  if (typeof error === 'object' && error !== null) {
    const e = error as LLMError;
    return {
      status: typeof e.status === 'number' ? e.status : undefined,
      code: typeof e.code === 'string' ? e.code : undefined,
    };
  }
  return {};
}

const HTTP_STATUS_CLASSIFICATION = new Map<
  number,
  {
    code: ErrorCodeType;
    messageTemplate: (provider: LLMProvider, status: number) => string;
    recoveryHint: string | ((provider: LLMProvider) => string);
  }
>([
  [
    429,
    {
      code: ErrorCode.E_LLM_RATE_LIMITED,
      messageTemplate: (p) => `Rate limited by ${p} (HTTP 429)`,
      recoveryHint:
        'Retry with exponential backoff or reduce request frequency',
    },
  ],
  [
    401,
    {
      code: ErrorCode.E_LLM_AUTH_FAILED,
      messageTemplate: (p, s) => `Authentication failed for ${p} (HTTP ${s})`,
      recoveryHint: (p) =>
        `Check ${PROVIDER_CONFIG[p as ValidProvider].envKey} environment variable`,
    },
  ],
  [
    403,
    {
      code: ErrorCode.E_LLM_AUTH_FAILED,
      messageTemplate: (p, s) => `Authentication failed for ${p} (HTTP ${s})`,
      recoveryHint: (p) =>
        `Check ${PROVIDER_CONFIG[p as ValidProvider].envKey} environment variable`,
    },
  ],
  [
    500,
    {
      code: ErrorCode.E_LLM_FAILED,
      messageTemplate: (p, s) => `${p} service unavailable (HTTP ${s})`,
      recoveryHint: 'Service temporarily unavailable; retry later',
    },
  ],
  [
    502,
    {
      code: ErrorCode.E_LLM_FAILED,
      messageTemplate: (p, s) => `${p} service unavailable (HTTP ${s})`,
      recoveryHint: 'Service temporarily unavailable; retry later',
    },
  ],
  [
    503,
    {
      code: ErrorCode.E_LLM_FAILED,
      messageTemplate: (p, s) => `${p} service unavailable (HTTP ${s})`,
      recoveryHint: 'Service temporarily unavailable; retry later',
    },
  ],
  [
    504,
    {
      code: ErrorCode.E_LLM_FAILED,
      messageTemplate: (p, s) => `${p} service unavailable (HTTP ${s})`,
      recoveryHint: 'Service temporarily unavailable; retry later',
    },
  ],
]);

const ERROR_CODE_PATTERNS = {
  rateLimited: ['rate_limit_exceeded', 'insufficient_quota'],
  authFailed: ['invalid_api_key', 'authentication_error'],
} as const;

const MESSAGE_PATTERNS: {
  keywords: readonly string[];
  code: ErrorCodeType;
  messageTemplate: (provider: LLMProvider, message: string) => string;
  recoveryHint?: string;
}[] = [
  {
    keywords: ['rate', '429', 'too many requests', 'quota'],
    code: ErrorCode.E_LLM_RATE_LIMITED,
    messageTemplate: (p, m) => `Rate limited by ${p}: ${m}`,
  },
  {
    keywords: ['auth', '401', '403', 'invalid api key', 'permission'],
    code: ErrorCode.E_LLM_AUTH_FAILED,
    messageTemplate: (p, m) => `Authentication failed for ${p}: ${m}`,
  },
  {
    keywords: ['context', 'token', 'too long', 'maximum'],
    code: ErrorCode.E_LLM_FAILED,
    messageTemplate: (p, m) => `Context length exceeded for ${p}: ${m}`,
  },
  {
    keywords: ['content', 'filter', 'safety', 'blocked', 'policy'],
    code: ErrorCode.E_LLM_FAILED,
    messageTemplate: (p, m) => `Content filtered by ${p}: ${m}`,
  },
  {
    keywords: ['503', '502', '500', 'unavailable', 'overloaded'],
    code: ErrorCode.E_LLM_FAILED,
    messageTemplate: (p, m) => `Service unavailable: ${p}: ${m}`,
  },
];

function classifyByHttpStatus(
  status: number | undefined,
  provider: LLMProvider,
  llmError: LLMError
): McpError | null {
  if (typeof status !== 'number') return null;

  const classification = HTTP_STATUS_CLASSIFICATION.get(status);
  if (!classification) return null;

  const recoveryHint =
    typeof classification.recoveryHint === 'function'
      ? classification.recoveryHint(provider)
      : classification.recoveryHint;

  return new McpError(
    classification.code,
    classification.messageTemplate(provider, status),
    undefined,
    { provider, ...getSafeErrorDetails(llmError) },
    recoveryHint
  );
}

function classifyByErrorCode(
  code: string | undefined,
  provider: LLMProvider,
  llmError: LLMError
): McpError | null {
  if (!code) return null;

  if (ERROR_CODE_PATTERNS.rateLimited.includes(code as never)) {
    const recoveryHint =
      code === 'insufficient_quota'
        ? 'Insufficient quota: check account billing'
        : 'Retry with exponential backoff or reduce request frequency';

    return new McpError(
      ErrorCode.E_LLM_RATE_LIMITED,
      `Rate limited by ${provider}: ${code}`,
      undefined,
      { provider, ...getSafeErrorDetails(llmError) },
      recoveryHint
    );
  }

  if (ERROR_CODE_PATTERNS.authFailed.includes(code as never)) {
    return new McpError(
      ErrorCode.E_LLM_AUTH_FAILED,
      `Authentication failed for ${provider}: ${code}`,
      undefined,
      { provider, ...getSafeErrorDetails(llmError) },
      `Check ${PROVIDER_CONFIG[provider as ValidProvider].envKey} environment variable`
    );
  }

  return null;
}

function classifyByMessage(
  message: string,
  provider: LLMProvider,
  llmError: LLMError
): McpError | null {
  const lowerMessage = message.toLowerCase();

  for (const pattern of MESSAGE_PATTERNS) {
    if (pattern.keywords.some((keyword) => lowerMessage.includes(keyword))) {
      return new McpError(
        pattern.code,
        pattern.messageTemplate(provider, message),
        undefined,
        { provider, ...getSafeErrorDetails(llmError) },
        pattern.recoveryHint
      );
    }
  }

  return null;
}

function classifyLLMError(error: unknown, provider: LLMProvider): McpError {
  const llmError = error as LLMError;
  const message = getErrorMessage(error);

  const httpError = classifyByHttpStatus(llmError.status, provider, llmError);
  if (httpError) return httpError;

  const codeError = classifyByErrorCode(llmError.code, provider, llmError);
  if (codeError) return codeError;

  const messageError = classifyByMessage(message, provider, llmError);
  if (messageError) return messageError;

  return new McpError(
    ErrorCode.E_LLM_FAILED,
    `LLM request failed (${provider}): ${message}`,
    undefined,
    { provider, ...getSafeErrorDetails(error) },
    'See provider logs or retry the request'
  );
}

function getRequestOptions(options?: LLMRequestOptions):
  | {
      timeout?: number;
      signal?: AbortSignal;
    }
  | undefined {
  const timeout = options?.timeoutMs;
  const signal = options?.signal;
  return timeout || signal ? { timeout, signal } : undefined;
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Request aborted before starting');
  }
}

class OpenAIClient implements LLMClient {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly provider: LLMProvider = 'openai';

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async generateText(
    prompt: string,
    maxTokens = LLM_MAX_TOKENS,
    options?: LLMRequestOptions
  ): Promise<string> {
    return withRetry(async () => {
      const start = process.hrtime.bigint();
      try {
        const response = await this.client.chat.completions.create(
          {
            model: this.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens,
            temperature: 0.7,
          },
          {
            ...getRequestOptions(options),
            timeout: options?.timeoutMs ?? 60000,
          }
        );
        const content = response.choices[0]?.message.content?.trim() ?? '';
        invariant(content, 'LLM returned empty response');

        const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
        logger.debug(
          `LLM generation (${this.provider}) took ${durationMs.toFixed(2)}ms`
        );

        return content;
      } catch (error) {
        throw classifyLLMError(error, this.provider);
      }
    });
  }

  getProvider(): LLMProvider {
    return this.provider;
  }

  getModel(): string {
    return this.model;
  }
}

class AnthropicClient implements LLMClient {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly provider: LLMProvider = 'anthropic';

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generateText(
    prompt: string,
    maxTokens = LLM_MAX_TOKENS,
    options?: LLMRequestOptions
  ): Promise<string> {
    return withRetry(async () => {
      const start = process.hrtime.bigint();
      try {
        const response = await this.client.messages.create(
          {
            model: this.model,
            max_tokens: maxTokens,
            messages: [{ role: 'user', content: prompt }],
          },
          {
            ...getRequestOptions(options),
            timeout: options?.timeoutMs ?? 60000,
          }
        );
        const textBlock = response.content.find(
          (block) => block.type === 'text'
        );
        const content =
          textBlock && 'text' in textBlock ? textBlock.text.trim() : '';
        invariant(content, 'LLM returned empty response');

        const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
        logger.debug(
          `LLM generation (${this.provider}) took ${durationMs.toFixed(2)}ms`
        );

        return content;
      } catch (error) {
        throw classifyLLMError(error, this.provider);
      }
    });
  }

  getProvider(): LLMProvider {
    return this.provider;
  }

  getModel(): string {
    return this.model;
  }
}

// Google safety categories for content filtering
const GOOGLE_SAFETY_CATEGORIES = [
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
  HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
] as const;

class GoogleClient implements LLMClient {
  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly provider: LLMProvider = 'google';

  constructor(apiKey: string, model: string) {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async generateText(
    prompt: string,
    maxTokens = LLM_MAX_TOKENS,
    options?: LLMRequestOptions
  ): Promise<string> {
    return withRetry(async () => {
      const start = process.hrtime.bigint();
      try {
        const effectiveSignal =
          options?.signal ??
          (options?.timeoutMs
            ? AbortSignal.timeout(options.timeoutMs)
            : undefined);
        checkAborted(effectiveSignal);
        const response = await this.executeRequest(prompt, maxTokens, {
          ...options,
          signal: effectiveSignal,
        });
        invariant(response, 'LLM returned empty response');

        const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
        logger.debug(
          `LLM generation (${this.provider}) took ${durationMs.toFixed(2)}ms`
        );

        return response.trim();
      } catch (error) {
        throw classifyLLMError(error, this.provider);
      }
    });
  }

  private buildSafetySettings(): {
    category: HarmCategory;
    threshold: HarmBlockThreshold;
  }[] {
    // WARNING: Disabling safety settings can expose the application to harmful content.
    // Use with caution and only in trusted environments.
    const threshold = config.GOOGLE_SAFETY_DISABLED
      ? HarmBlockThreshold.OFF
      : HarmBlockThreshold.BLOCK_ONLY_HIGH;

    return GOOGLE_SAFETY_CATEGORIES.map((category) => ({
      category,
      threshold,
    }));
  }

  private async executeRequest(
    prompt: string,
    maxTokens: number,
    options?: LLMRequestOptions
  ): Promise<string> {
    const generatePromise = this.client.models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        maxOutputTokens: maxTokens,
        safetySettings: this.buildSafetySettings(),
      },
    });

    if (options?.signal) {
      const abortPromise = new Promise<never>((_, reject) => {
        options.signal?.addEventListener('abort', () => {
          reject(new Error('Request aborted'));
        });
      });
      const response = await Promise.race([generatePromise, abortPromise]);
      return response.text ?? '';
    }

    const response = await generatePromise;
    return response.text ?? '';
  }

  getProvider(): LLMProvider {
    return this.provider;
  }

  getModel(): string {
    return this.model;
  }
}

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

function createLLMClient(): LLMClient {
  const providerEnv = config.LLM_PROVIDER;

  const providerConfig = PROVIDER_CONFIG[providerEnv];
  // We access the key from config based on the provider
  let apiKey: string | undefined;
  if (providerEnv === 'openai') apiKey = config.OPENAI_API_KEY;
  else if (providerEnv === 'anthropic') apiKey = config.ANTHROPIC_API_KEY;
  else apiKey = config.GOOGLE_API_KEY;

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
