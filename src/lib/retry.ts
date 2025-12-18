import type { RetryOptions } from '../config/types.js';
import { ErrorCode, logger, McpError } from './errors.js';

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: parseInt(process.env.RETRY_MAX_ATTEMPTS ?? '3', 10),
  baseDelayMs: parseInt(process.env.RETRY_BASE_DELAY_MS ?? '1000', 10),
  maxDelayMs: parseInt(process.env.RETRY_MAX_DELAY_MS ?? '10000', 10),
  totalTimeoutMs: parseInt(process.env.RETRY_TOTAL_TIMEOUT_MS ?? '180000', 10),
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

function isRetryableError(error: unknown): boolean {
  if (error instanceof McpError) {
    if (NON_RETRYABLE_MCP_CODES.has(error.code)) return false;
    if (RETRYABLE_MCP_CODES.has(error.code)) return true;
  }

  if (error instanceof Error && 'code' in error) {
    const code = String(error.code);
    if (RETRYABLE_ERROR_CODES.has(code)) return true;
  }

  const errorMessage =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();

  for (const code of RETRYABLE_ERROR_CODES) {
    if (errorMessage.includes(code.toLowerCase())) return true;
  }

  for (const httpCode of RETRYABLE_HTTP_CODES) {
    if (errorMessage.includes(httpCode)) return true;
  }

  return false;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  handler: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    if (Date.now() - startTime > opts.totalTimeoutMs) {
      throw new McpError(
        ErrorCode.E_TIMEOUT,
        `Total retry timeout exceeded (${opts.totalTimeoutMs}ms)`
      );
    }

    try {
      return await handler();
    } catch (error) {
      lastError = error;

      if (attempt >= opts.maxRetries) {
        break;
      }

      if (!isRetryableError(error)) {
        logger.debug(
          `Non-retryable error: ${error instanceof Error ? error.message : String(error)}`
        );
        break;
      }

      const delayMs = calculateDelay(
        attempt,
        opts.baseDelayMs,
        opts.maxDelayMs
      );

      if (Date.now() - startTime + delayMs > opts.totalTimeoutMs) {
        logger.warn('Retry loop would exceed total timeout, aborting');
        break;
      }

      logger.warn(
        `Retry ${attempt + 1}/${opts.maxRetries + 1} in ${Math.round(delayMs)}ms: ${error instanceof Error ? error.message : String(error)}`
      );

      await sleep(delayMs);

      if (Date.now() - startTime > opts.totalTimeoutMs) {
        throw new McpError(
          ErrorCode.E_TIMEOUT,
          `Total retry timeout exceeded (${opts.totalTimeoutMs}ms)`
        );
      }
    }
  }

  throw lastError;
}
