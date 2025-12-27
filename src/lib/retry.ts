import { setTimeout } from 'node:timers/promises';

import { config } from '../config/env.js';
import type { RetryOptions } from '../config/types.js';
import { ErrorCode, logger, McpError } from './errors.js';

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: config.RETRY_MAX_ATTEMPTS,
  baseDelayMs: config.RETRY_BASE_DELAY_MS,
  maxDelayMs: config.RETRY_MAX_DELAY_MS,
  totalTimeoutMs: config.RETRY_TOTAL_TIMEOUT_MS,
};

const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'rate_limit_exceeded',
  'overloaded',
  'service_unavailable',
]);

const RETRYABLE_HTTP_CODES = new Set(['429', '500', '502', '503', '504']);

const NON_RETRYABLE_MCP_CODES = new Set<string>([
  ErrorCode.E_LLM_AUTH_FAILED,
  ErrorCode.E_INVALID_INPUT,
]);

const RETRYABLE_MCP_CODES = new Set<string>([
  ErrorCode.E_LLM_RATE_LIMITED,
  ErrorCode.E_TIMEOUT,
]);

interface AttemptSuccess<T> {
  ok: true;
  value: T;
}

interface AttemptFailure {
  ok: false;
  error: unknown;
}

type AttemptResult<T> = AttemptSuccess<T> | AttemptFailure;

function createAbortError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  const abortError = new Error('Request aborted');
  abortError.name = 'AbortError';
  return abortError;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw createAbortError(signal.reason);
}

function getMcpRetryDecision(error: unknown): boolean | null {
  if (!(error instanceof McpError)) return null;
  if (NON_RETRYABLE_MCP_CODES.has(error.code)) return false;
  if (RETRYABLE_MCP_CODES.has(error.code)) return true;
  return null;
}

function getErrorCode(error: unknown): string | null {
  if (error instanceof Error && 'code' in error) {
    return String(error.code);
  }
  return null;
}

function getErrorMessageLower(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).toLowerCase();
}

function containsAny(haystack: string, needles: Iterable<string>): boolean {
  for (const needle of needles) {
    if (haystack.includes(needle.toLowerCase())) return true;
  }
  return false;
}

function isRetryableError(error: unknown): boolean {
  const mcpDecision = getMcpRetryDecision(error);
  if (mcpDecision !== null) return mcpDecision;

  const code = getErrorCode(error);
  if (code && RETRYABLE_ERROR_CODES.has(code)) return true;

  const errorMessage = getErrorMessageLower(error);
  return (
    containsAny(errorMessage, RETRYABLE_ERROR_CODES) ||
    containsAny(errorMessage, RETRYABLE_HTTP_CODES)
  );
}

function calculateDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay;
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

function ensureWithinTotalTimeout(
  startTime: number,
  totalTimeoutMs: number
): void {
  if (Date.now() - startTime > totalTimeoutMs) {
    throw new McpError(
      ErrorCode.E_TIMEOUT,
      `Total retry timeout exceeded (${totalTimeoutMs}ms)`
    );
  }
}

function wouldExceedTotalTimeout(
  startTime: number,
  totalTimeoutMs: number,
  delayMs: number
): boolean {
  return Date.now() - startTime + delayMs > totalTimeoutMs;
}

function logNonRetryable(error: unknown): void {
  logger.debug(
    `Non-retryable error: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
}

function logRetryAttempt(
  attempt: number,
  maxRetries: number,
  error: unknown,
  delayMs: number
): void {
  logger.warn(
    `Retry ${attempt + 1}/${maxRetries + 1} in ${Math.round(delayMs)}ms: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
}

async function attemptHandler<T>(
  handler: () => Promise<T>,
  startTime: number,
  totalTimeoutMs: number,
  signal?: AbortSignal
): Promise<AttemptResult<T>> {
  ensureWithinTotalTimeout(startTime, totalTimeoutMs);
  throwIfAborted(signal);
  try {
    const value = await handler();
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error };
  }
}

function resolveRetryDelay(
  attempt: number,
  options: Required<RetryOptions>,
  startTime: number,
  lastError: unknown,
  signal?: AbortSignal
): number | null {
  if (shouldStopRetry(attempt, options, lastError, signal)) return null;

  const delayMs = calculateDelay(
    attempt,
    options.baseDelayMs,
    options.maxDelayMs
  );
  if (wouldExceedTotalTimeout(startTime, options.totalTimeoutMs, delayMs)) {
    logger.warn('Retry loop would exceed total timeout, aborting');
    return null;
  }

  return delayMs;
}

function shouldStopRetry(
  attempt: number,
  options: Required<RetryOptions>,
  lastError: unknown,
  signal?: AbortSignal
): boolean {
  if (signal?.aborted) return true;
  if (attempt >= options.maxRetries) return true;
  if (!isRetryableError(lastError)) {
    logNonRetryable(lastError);
    return true;
  }
  return false;
}

async function waitForRetry(
  attempt: number,
  options: Required<RetryOptions>,
  lastError: unknown,
  delayMs: number,
  startTime: number,
  signal?: AbortSignal
): Promise<void> {
  throwIfAborted(signal);
  logRetryAttempt(attempt, options.maxRetries, lastError, delayMs);
  await setTimeout(delayMs, undefined, { signal });
  ensureWithinTotalTimeout(startTime, options.totalTimeoutMs);
}

function logRetriesExhausted(
  options: Required<RetryOptions>,
  lastError: unknown
): void {
  const message =
    lastError instanceof Error ? lastError.message : String(lastError);
  logger.warn(
    `All ${options.maxRetries + 1} retry attempts exhausted: ${message}`
  );
}

export async function withRetry<T>(
  handler: () => Promise<T>,
  options: RetryOptions = {},
  signal?: AbortSignal
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    const result = await attemptHandler(
      handler,
      startTime,
      opts.totalTimeoutMs,
      signal
    );
    if (result.ok) return result.value;
    lastError = result.error;

    throwIfAborted(signal);

    const delayMs = resolveRetryDelay(
      attempt,
      opts,
      startTime,
      lastError,
      signal
    );
    if (delayMs === null) break;
    await waitForRetry(attempt, opts, lastError, delayMs, startTime, signal);
  }

  logRetriesExhausted(opts, lastError);
  throw lastError;
}
