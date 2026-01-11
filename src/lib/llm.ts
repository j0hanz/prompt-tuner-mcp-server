import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout } from 'node:timers/promises';

import Anthropic from '@anthropic-ai/sdk';

import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from '@google/genai';

import OpenAI from 'openai';

import { DEFAULT_MODELS, LLM_MAX_TOKENS } from '../config.js';
import { config } from '../config.js';
import type {
  ErrorCodeType,
  LLMClient,
  LLMError,
  LLMProvider,
  LLMRequestOptions,
  ProviderInfo,
  SafeErrorDetails,
} from '../types.js';
import { ErrorCode, logger, McpError } from './errors.js';
import { publishLlmRequest } from './telemetry.js';

const DEFAULT_TIMEOUT_MS = config.LLM_TIMEOUT_MS;

function buildAbortSignal(
  timeoutMs: number,
  signal?: AbortSignal
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

function checkAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

function trimText(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function buildTimeoutOptions(options?: LLMRequestOptions): {
  timeout: number;
  signal?: AbortSignal;
} {
  const resolved: { timeout: number; signal?: AbortSignal } = {
    timeout: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };

  if (options?.signal !== undefined) {
    resolved.signal = options.signal;
  }

  return resolved;
}

async function createCompletion<TResponse, TResult>(
  options: LLMRequestOptions | undefined,
  create: (requestOptions: {
    timeout: number;
    signal?: AbortSignal;
  }) => PromiseLike<TResponse>,
  extract: (response: TResponse) => TResult
): Promise<TResult> {
  const response = await create(buildTimeoutOptions(options));
  return extract(response);
}

function buildOpenAIRequest(
  model: string,
  prompt: string,
  maxTokens: number
): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
  return {
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    stream: false,
  };
}

function extractOpenAIText(
  response: OpenAI.Chat.Completions.ChatCompletion
): string {
  const choice = response.choices[0];
  if (!choice) return '';
  return trimText(choice.message.content);
}

function buildAnthropicRequest(
  model: string,
  prompt: string,
  maxTokens: number
): Anthropic.Messages.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
  };
}

function extractAnthropicText(response: Anthropic.Messages.Message): string {
  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || !('text' in textBlock)) return '';
  return trimText(textBlock.text);
}

function runTextCompletion<TResponse>(
  provider: LLMProvider,
  model: string,
  options: LLMRequestOptions | undefined,
  create: (requestOptions: {
    timeout: number;
    signal?: AbortSignal;
  }) => PromiseLike<TResponse>,
  extract: (response: TResponse) => string
): Promise<string> {
  return runGeneration(
    provider,
    model,
    () => createCompletion(options, create, extract),
    options?.signal
  );
}

const PROVIDER_ENV_KEYS: Record<LLMProvider, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
};

const AUTH_FAILURE_CLASSIFICATION = {
  code: ErrorCode.E_LLM_AUTH_FAILED,
  messageTemplate: (provider: LLMProvider, status: number) =>
    `Authentication failed for ${provider} (HTTP ${status})`,
  recoveryHint: (provider: LLMProvider) =>
    `Check ${PROVIDER_ENV_KEYS[provider]} environment variable`,
};

const SERVICE_UNAVAILABLE_CLASSIFICATION = {
  code: ErrorCode.E_LLM_FAILED,
  messageTemplate: (provider: LLMProvider, status: number) =>
    `${provider} service unavailable (HTTP ${status})`,
  recoveryHint: 'Service temporarily unavailable; retry later',
};

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
      messageTemplate: (provider) => `Rate limited by ${provider} (HTTP 429)`,
      recoveryHint:
        'Retry with exponential backoff or reduce request frequency',
    },
  ],
  [401, AUTH_FAILURE_CLASSIFICATION],
  [403, AUTH_FAILURE_CLASSIFICATION],
  [500, SERVICE_UNAVAILABLE_CLASSIFICATION],
  [502, SERVICE_UNAVAILABLE_CLASSIFICATION],
  [503, SERVICE_UNAVAILABLE_CLASSIFICATION],
  [504, SERVICE_UNAVAILABLE_CLASSIFICATION],
]);

const ERROR_CODE_PATTERNS = {
  rateLimited: ['rate_limit_exceeded', 'insufficient_quota'],
  authFailed: ['invalid_api_key', 'authentication_error'],
} as const;

const RATE_LIMITED_CODES = new Set<string>(ERROR_CODE_PATTERNS.rateLimited);
const AUTH_FAILED_CODES = new Set<string>(ERROR_CODE_PATTERNS.authFailed);

function isRateLimitedCode(
  value: string
): value is (typeof ERROR_CODE_PATTERNS.rateLimited)[number] {
  return RATE_LIMITED_CODES.has(value);
}

function isAuthFailedCode(
  value: string
): value is (typeof ERROR_CODE_PATTERNS.authFailed)[number] {
  return AUTH_FAILED_CODES.has(value);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortLikeError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { name?: unknown; message?: unknown; code?: unknown };

  if (e.name === 'AbortError') return true;
  if (e.code === 'ABORT_ERR') return true;
  if (typeof e.message === 'string' && /\babort(ed|ing)?\b/i.test(e.message)) {
    return true;
  }

  return false;
}

function isTimeoutLikeError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { name?: unknown; message?: unknown; code?: unknown };

  if (e.name === 'TimeoutError') return true;
  if (e.code === 'ETIMEDOUT') return true;
  if (typeof e.message === 'string' && /\btime(d)?\s*out\b/i.test(e.message)) {
    return true;
  }

  return false;
}

function getSafeErrorDetails(error: unknown): SafeErrorDetails {
  if (typeof error === 'object' && error !== null) {
    const e = error as LLMError;
    return {
      ...(typeof e.status === 'number' ? { status: e.status } : {}),
      ...(typeof e.code === 'string' ? { code: e.code } : {}),
    };
  }
  return {};
}

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

  if (isRateLimitedCode(code)) {
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

  if (isAuthFailedCode(code)) {
    return new McpError(
      ErrorCode.E_LLM_AUTH_FAILED,
      `Authentication failed for ${provider}: ${code}`,
      undefined,
      { provider, ...getSafeErrorDetails(llmError) },
      `Check ${PROVIDER_ENV_KEYS[provider]} environment variable`
    );
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

  return new McpError(
    ErrorCode.E_LLM_FAILED,
    `LLM request failed (${provider}): ${message}`,
    undefined,
    { provider, ...getSafeErrorDetails(error) },
    'See provider logs or retry the request'
  );
}

function coerceMcpError(error: unknown, provider: LLMProvider): McpError {
  if (error instanceof McpError) return error;

  if (isAbortLikeError(error)) {
    return new McpError(ErrorCode.E_TIMEOUT, 'Request aborted');
  }

  if (isTimeoutLikeError(error)) {
    return new McpError(ErrorCode.E_TIMEOUT, 'Request timed out');
  }

  return classifyLLMError(error, provider);
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const NON_RETRYABLE_CODES = new Set<ErrorCodeType>([
  ErrorCode.E_LLM_AUTH_FAILED,
  ErrorCode.E_INVALID_INPUT,
]);

function resolveRetrySettings(): {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  totalTimeoutMs: number;
} {
  return {
    maxRetries: config.RETRY_MAX_ATTEMPTS,
    baseDelayMs: config.RETRY_BASE_DELAY_MS,
    maxDelayMs: config.RETRY_MAX_DELAY_MS,
    totalTimeoutMs: config.RETRY_TOTAL_TIMEOUT_MS,
  };
}

type AttemptOutcome =
  | { type: 'success'; content: string }
  | { type: 'retry'; delayMs: number }
  | { type: 'fail'; error: McpError };

interface RetrySettings {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  totalTimeoutMs: number;
}

function isRetryable(error: McpError): boolean {
  if (NON_RETRYABLE_CODES.has(error.code)) return false;
  if (error.code === ErrorCode.E_LLM_RATE_LIMITED) return true;

  const status = error.details?.status;
  return typeof status === 'number' && RETRYABLE_STATUS.has(status);
}

function calculateDelay(attempt: number, settings: RetrySettings): number {
  const exponentialDelay = settings.baseDelayMs * Math.pow(2, attempt);
  const cap = Math.min(exponentialDelay, settings.maxDelayMs);
  const min = Math.floor(cap / 2);
  // Equal jitter to spread retries without collapsing to 0ms delays.
  return min + randomInt(0, cap - min + 1);
}

function ensureWithinTotalTimeout(
  startTime: number,
  settings: RetrySettings
): void {
  if (Date.now() - startTime <= settings.totalTimeoutMs) return;
  throw new McpError(
    ErrorCode.E_TIMEOUT,
    `Total retry timeout exceeded (${settings.totalTimeoutMs}ms)`
  );
}

function resolveDelay(
  attempt: number,
  settings: RetrySettings,
  startTime: number
): number | null {
  if (attempt >= settings.maxRetries) return null;
  const delayMs = calculateDelay(attempt, settings);
  if (Date.now() - startTime + delayMs > settings.totalTimeoutMs) {
    logger.warn('Retry loop would exceed total timeout, aborting');
    return null;
  }
  return delayMs;
}

function assertNonEmptyResponse(content: string): void {
  assert.ok(
    content,
    'LLM returned empty response (possibly blocked or filtered)'
  );
}

function logAttemptDuration(provider: LLMProvider, attemptStart: number): void {
  logger.debug(
    `LLM generation (${provider}) took ${(performance.now() - attemptStart).toFixed(2)}ms`
  );
}

function resolveRetryOutcome(
  error: unknown,
  provider: LLMProvider,
  attempt: number,
  settings: RetrySettings,
  startTime: number
): AttemptOutcome {
  const mcpError = coerceMcpError(error, provider);
  if (!isRetryable(mcpError)) return { type: 'fail', error: mcpError };
  const delayMs = resolveDelay(attempt, settings, startTime);
  if (delayMs === null) return { type: 'fail', error: mcpError };
  logger.warn(
    `Retry ${attempt + 1}/${settings.maxRetries + 1} in ${Math.round(delayMs)}ms: ${mcpError.message}`
  );
  return { type: 'retry', delayMs };
}

async function waitForRetry(
  delayMs: number,
  signal: AbortSignal | undefined
): Promise<void> {
  try {
    await setTimeout(delayMs, undefined, { signal, ref: false });
  } catch (error) {
    if (signal?.aborted) {
      throw new McpError(ErrorCode.E_TIMEOUT, 'Request aborted');
    }
    throw error;
  }
}

async function handleOutcome(
  outcome: AttemptOutcome,
  signal: AbortSignal | undefined
): Promise<string | null> {
  if (outcome.type === 'success') return outcome.content;
  if (outcome.type === 'fail') throw outcome.error;
  await waitForRetry(outcome.delayMs, signal);
  return null;
}

async function attemptGeneration(
  provider: LLMProvider,
  requestFn: () => Promise<string>,
  signal: AbortSignal | undefined,
  settings: RetrySettings,
  startTime: number,
  attempt: number
): Promise<AttemptOutcome> {
  ensureWithinTotalTimeout(startTime, settings);
  signal?.throwIfAborted();
  const attemptStart = performance.now();

  try {
    const content = await requestFn();
    assertNonEmptyResponse(content);
    logAttemptDuration(provider, attemptStart);
    return { type: 'success', content };
  } catch (error) {
    return resolveRetryOutcome(error, provider, attempt, settings, startTime);
  }
}

async function executeAttempts(
  provider: LLMProvider,
  requestFn: () => Promise<string>,
  signal: AbortSignal | undefined
): Promise<{ content: string; attemptsUsed: number }> {
  const settings = resolveRetrySettings() as RetrySettings;
  const startTime = Date.now();
  let attemptsUsed = 0;
  for (let attempt = 0; attempt <= settings.maxRetries; attempt++) {
    attemptsUsed = attempt + 1;
    const outcome = await attemptGeneration(
      provider,
      requestFn,
      signal,
      settings,
      startTime,
      attempt
    );
    const content = await handleOutcome(outcome, signal);
    if (content !== null) {
      return { content, attemptsUsed };
    }
  }

  throw new McpError(
    ErrorCode.E_LLM_FAILED,
    `LLM request failed (${provider}): Unknown error`
  );
}

interface RunFailureDetails {
  errorCode?: ErrorCodeType;
  status?: number;
}

function resolveFailureDetails(error: unknown): RunFailureDetails {
  if (!(error instanceof McpError)) return {};
  const status =
    typeof error.details?.status === 'number'
      ? error.details.status
      : undefined;
  const details: RunFailureDetails = { errorCode: error.code };
  if (status !== undefined) {
    details.status = status;
  }
  return details;
}

function publishSuccessEvent(
  provider: LLMProvider,
  model: string,
  attempts: number,
  startPerf: number
): void {
  publishLlmRequest({
    provider,
    model,
    attempts,
    durationMs: performance.now() - startPerf,
    ok: true,
  });
}

function publishFailureEvent(
  provider: LLMProvider,
  model: string,
  attempts: number,
  startPerf: number,
  details: RunFailureDetails
): void {
  publishLlmRequest({
    provider,
    model,
    attempts,
    durationMs: performance.now() - startPerf,
    ok: false,
    ...(details.errorCode !== undefined
      ? { errorCode: details.errorCode }
      : {}),
    ...(details.status !== undefined ? { status: details.status } : {}),
  });
}

async function runGeneration(
  provider: LLMProvider,
  model: string,
  requestFn: () => Promise<string>,
  signal?: AbortSignal
): Promise<string> {
  const startPerf = performance.now();
  let attemptsUsed = 0;

  try {
    const { attemptsUsed: usedAttempts, content } = await executeAttempts(
      provider,
      requestFn,
      signal
    );
    attemptsUsed = usedAttempts;
    publishSuccessEvent(provider, model, attemptsUsed, startPerf);
    return content;
  } catch (error) {
    publishFailureEvent(
      provider,
      model,
      attemptsUsed,
      startPerf,
      resolveFailureDetails(error)
    );
    throw error;
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

export async function getProviderInfo(): Promise<ProviderInfo> {
  const client = await getLLMClient();
  return { provider: client.getProvider(), model: client.getModel() };
}

export class OpenAIClient implements LLMClient {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly provider: LLMProvider = 'openai';

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  generateText(
    prompt: string,
    maxTokens = LLM_MAX_TOKENS,
    options?: LLMRequestOptions
  ): Promise<string> {
    const request = buildOpenAIRequest(this.model, prompt, maxTokens);
    return runTextCompletion(
      this.provider,
      this.model,
      options,
      (requestOptions) =>
        this.client.chat.completions.create(request, requestOptions),
      extractOpenAIText
    );
  }

  getProvider(): LLMProvider {
    return this.provider;
  }

  getModel(): string {
    return this.model;
  }
}

export class AnthropicClient implements LLMClient {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly provider: LLMProvider = 'anthropic';

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  generateText(
    prompt: string,
    maxTokens = LLM_MAX_TOKENS,
    options?: LLMRequestOptions
  ): Promise<string> {
    const request = buildAnthropicRequest(this.model, prompt, maxTokens);
    return runTextCompletion(
      this.provider,
      this.model,
      options,
      (requestOptions) => this.client.messages.create(request, requestOptions),
      extractAnthropicText
    );
  }

  getProvider(): LLMProvider {
    return this.provider;
  }

  getModel(): string {
    return this.model;
  }
}

const GOOGLE_SAFETY_CATEGORIES = [
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
  HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
] as const;

type GoogleGenerateResponse = Awaited<
  ReturnType<GoogleGenAI['models']['generateContent']>
>;
type GoogleGenerateRequest = Parameters<
  GoogleGenAI['models']['generateContent']
>[0];

interface SafetySetting {
  category: HarmCategory;
  threshold: HarmBlockThreshold;
}

interface SafetyCache {
  disabled: boolean;
  settings: SafetySetting[];
}

export class GoogleClient implements LLMClient {
  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly provider: LLMProvider = 'google';
  private safetySettingsCache: SafetyCache | null = null;

  constructor(apiKey: string, model: string) {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  generateText(
    prompt: string,
    maxTokens = LLM_MAX_TOKENS,
    options?: LLMRequestOptions
  ): Promise<string> {
    return runGeneration(
      this.provider,
      this.model,
      () => this.requestCompletion(prompt, maxTokens, options),
      options?.signal
    );
  }

  private async requestCompletion(
    prompt: string,
    maxTokens: number,
    options?: LLMRequestOptions
  ): Promise<string> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const signal = buildAbortSignal(timeoutMs, options?.signal);
    checkAborted(signal);
    const response = await this.executeRequest(prompt, maxTokens, {
      ...options,
      timeoutMs,
      signal,
    });
    return response.trim();
  }

  private buildSafetySettings(): SafetySetting[] {
    const disabled = config.GOOGLE_SAFETY_DISABLED;
    if (this.safetySettingsCache?.disabled === disabled) {
      return this.safetySettingsCache.settings;
    }

    const threshold = disabled
      ? HarmBlockThreshold.OFF
      : HarmBlockThreshold.BLOCK_ONLY_HIGH;
    const settings = GOOGLE_SAFETY_CATEGORIES.map((category) => ({
      category,
      threshold,
    }));
    this.safetySettingsCache = { disabled, settings };
    return settings;
  }

  private buildRequest(
    prompt: string,
    maxTokens: number,
    timeoutMs?: number,
    signal?: AbortSignal
  ): GoogleGenerateRequest {
    return {
      model: this.model,
      contents: prompt,
      config: {
        maxOutputTokens: maxTokens,
        safetySettings: this.buildSafetySettings(),
        ...(timeoutMs ? { httpOptions: { timeout: timeoutMs } } : {}),
        ...(signal ? { abortSignal: signal } : {}),
      },
    };
  }

  private async executeRequest(
    prompt: string,
    maxTokens: number,
    options?: LLMRequestOptions
  ): Promise<string> {
    const { signal, timeoutMs } = options ?? {};
    const request = this.buildRequest(prompt, maxTokens, timeoutMs, signal);
    const generatePromise = this.client.models.generateContent(request);

    if (!signal) {
      const response = await generatePromise;
      return this.finalizeResponse(response);
    }

    return this.executeWithAbort(generatePromise, signal);
  }

  private async executeWithAbort(
    generatePromise: Promise<GoogleGenerateResponse>,
    signal: AbortSignal
  ): Promise<string> {
    const abortPromise = new Promise<never>((_, reject) => {
      const onAbort = (): void => {
        reject(new Error('Request aborted'));
      };
      signal.addEventListener('abort', onAbort);
      void generatePromise.finally(() => {
        signal.removeEventListener('abort', onAbort);
      });
    });

    try {
      const response = await Promise.race([generatePromise, abortPromise]);
      return this.finalizeResponse(response);
    } catch (error) {
      if (signal.aborted) {
        void generatePromise.catch(() => {});
      }
      throw error;
    }
  }

  private finalizeResponse(response: GoogleGenerateResponse): string {
    if (String(response.candidates?.[0]?.finishReason) === 'SAFETY') {
      throw new Error('Content filtered by safety settings');
    }

    return response.text ?? '';
  }

  getProvider(): LLMProvider {
    return this.provider;
  }

  getModel(): string {
    return this.model;
  }
}
