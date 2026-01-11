import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { setTimeout } from 'node:timers/promises';

import type { LLMProvider } from '../config/types.js';
import { ErrorCode, logger, McpError } from './errors.js';
import {
  coerceMcpError,
  NON_RETRYABLE_CODES,
  resolveRetrySettings,
  RETRYABLE_STATUS,
} from './llm-runtime-classify.js';

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
    assertNonEmptyResponse(content);
    logAttemptDuration(provider, attemptStart);
    return { type: 'success', content };
  } catch (error) {
    return resolveRetryOutcome(error, provider, attempt, settings, startTime);
  }
}

export async function executeAttempts(
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
