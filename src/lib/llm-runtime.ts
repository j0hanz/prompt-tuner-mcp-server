import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { setTimeout } from 'node:timers/promises';

import { config } from '../config/env.js';
import type {
  ErrorCodeType,
  LLMError,
  LLMProvider,
  SafeErrorDetails,
  ValidProvider,
} from '../config/types.js';
import { ErrorCode, logger, McpError } from './errors.js';

const PROVIDER_ENV_KEYS = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
} as const;

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

interface HttpStatusClassification {
  code: ErrorCodeType;
  messageTemplate: (provider: LLMProvider, status: number) => string;
  recoveryHint: string | ((provider: LLMProvider) => string);
}

const AUTH_FAILURE_CLASSIFICATION: HttpStatusClassification = {
  code: ErrorCode.E_LLM_AUTH_FAILED,
  messageTemplate: (p, s) => `Authentication failed for ${p} (HTTP ${s})`,
  recoveryHint: (p) =>
    `Check ${PROVIDER_ENV_KEYS[p as ValidProvider]} environment variable`,
};

const SERVICE_UNAVAILABLE_CLASSIFICATION: HttpStatusClassification = {
  code: ErrorCode.E_LLM_FAILED,
  messageTemplate: (p, s) => `${p} service unavailable (HTTP ${s})`,
  recoveryHint: 'Service temporarily unavailable; retry later',
};

const HTTP_STATUS_CLASSIFICATION = new Map<number, HttpStatusClassification>([
  [
    429,
    {
      code: ErrorCode.E_LLM_RATE_LIMITED,
      messageTemplate: (p) => `Rate limited by ${p} (HTTP 429)`,
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

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const NON_RETRYABLE_CODES = new Set<ErrorCodeType>([
  ErrorCode.E_LLM_AUTH_FAILED,
  ErrorCode.E_INVALID_INPUT,
]);

interface RetrySettings {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  totalTimeoutMs: number;
}

function resolveRetrySettings(): RetrySettings {
  return {
    maxRetries: config.RETRY_MAX_ATTEMPTS,
    baseDelayMs: config.RETRY_BASE_DELAY_MS,
    maxDelayMs: config.RETRY_MAX_DELAY_MS,
    totalTimeoutMs: config.RETRY_TOTAL_TIMEOUT_MS,
  };
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
      `Check ${PROVIDER_ENV_KEYS[provider as ValidProvider]} environment variable`
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
  return classifyLLMError(error, provider);
}

function isRetryable(error: McpError): boolean {
  if (NON_RETRYABLE_CODES.has(error.code)) return false;
  if (error.code === ErrorCode.E_LLM_RATE_LIMITED) return true;

  const status = error.details?.status;
  return typeof status === 'number' && RETRYABLE_STATUS.has(status);
}

function calculateDelay(attempt: number, settings: RetrySettings): number {
  const exponentialDelay = settings.baseDelayMs * Math.pow(2, attempt);
  return Math.min(exponentialDelay, settings.maxDelayMs);
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

type AttemptOutcome =
  | { type: 'success'; content: string }
  | { type: 'retry'; delayMs: number }
  | { type: 'fail'; error: McpError };

async function waitForRetry(
  delayMs: number,
  signal: AbortSignal | undefined
): Promise<void> {
  try {
    await setTimeout(delayMs, undefined, { signal });
  } catch (error) {
    if (signal?.aborted) {
      throw new McpError(
        ErrorCode.E_TIMEOUT,
        'Request aborted during retry backoff'
      );
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
    assert.ok(
      content,
      'LLM returned empty response (possibly blocked or filtered)'
    );
    logger.debug(
      `LLM generation (${provider}) took ${(performance.now() - attemptStart).toFixed(2)}ms`
    );
    return { type: 'success', content };
  } catch (error) {
    const mcpError = coerceMcpError(error, provider);
    if (!isRetryable(mcpError)) return { type: 'fail', error: mcpError };
    const delayMs = resolveDelay(attempt, settings, startTime);
    if (delayMs === null) return { type: 'fail', error: mcpError };
    logger.warn(
      `Retry ${attempt + 1}/${settings.maxRetries + 1} in ${Math.round(delayMs)}ms: ${mcpError.message}`
    );
    return { type: 'retry', delayMs };
  }
}

export async function runGeneration(
  provider: LLMProvider,
  requestFn: () => Promise<string>,
  signal?: AbortSignal
): Promise<string> {
  const settings = resolveRetrySettings();
  const startTime = Date.now();

  for (let attempt = 0; attempt <= settings.maxRetries; attempt++) {
    const outcome = await attemptGeneration(
      provider,
      requestFn,
      signal,
      settings,
      startTime,
      attempt
    );

    const content = await handleOutcome(outcome, signal);
    if (content !== null) return content;
  }

  throw new McpError(
    ErrorCode.E_LLM_FAILED,
    `LLM request failed (${provider}): Unknown error`
  );
}
