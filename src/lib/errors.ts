import { inspect } from 'node:util';

import pino from 'pino';

import { config } from '../config/env.js';
import {
  ErrorCode,
  type ErrorCodeType,
  type ErrorResponse,
  type McpErrorOptions,
  type SuccessResponse,
} from '../config/types.js';

const stderrDestination = pino.destination({ fd: 2 });

export const logger = pino(
  {
    level: config.DEBUG ? 'debug' : 'info',
    base: { pid: process.pid },
  },
  stderrDestination
);

// Re-export debug loggers as sub-loggers if needed, or just use logger.debug
export const debugLLM = (msg: string, ...args: unknown[]): void => {
  logger.debug({ module: 'llm' }, msg, ...args);
};
export const debugCache = (msg: string, ...args: unknown[]): void => {
  logger.debug({ module: 'cache' }, msg, ...args);
};
export const debugRetry = (msg: string, ...args: unknown[]): void => {
  logger.debug({ module: 'retry' }, msg, ...args);
};

export class McpError extends Error {
  readonly code: ErrorCodeType;
  readonly context?: string;
  readonly details?: Record<string, unknown>;
  readonly recoveryHint?: string;

  constructor(
    code: ErrorCodeType,
    message: string,
    contextOrOptions?: string | McpErrorOptions,
    details?: Record<string, unknown>,
    recoveryHint?: string
  ) {
    super(message);
    this.name = 'McpError';
    this.code = code;

    if (typeof contextOrOptions === 'object') {
      this.context = contextOrOptions.context;
      this.details = contextOrOptions.details;
      this.recoveryHint = contextOrOptions.recoveryHint;
    } else {
      this.context = contextOrOptions;
      this.details = details;
      this.recoveryHint = recoveryHint;
    }
  }

  // Custom inspect output for better console debugging
  [inspect.custom](): string {
    const hint = this.recoveryHint ? ` (Hint: ${this.recoveryHint})` : '';
    const details = this.details ? ` ${JSON.stringify(this.details)}` : '';
    return `McpError[${this.code}]: ${this.message}${hint}${details}`;
  }
}

export function createSuccessResponse<T extends Record<string, unknown>>(
  text: string,
  structured: T
): SuccessResponse<T> {
  return {
    content: [{ type: 'text', text }],
    structuredContent: structured,
  };
}

// Sanitizes context by removing API keys and truncating prompts
function sanitizeErrorContext(context?: string): string | undefined {
  if (!context) return undefined;

  // Redact API keys (OpenAI, Anthropic, Google patterns)
  let sanitized = context
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, '[REDACTED_OPENAI_KEY]')
    .replace(/sk-ant-[A-Za-z0-9_-]{20,}/g, '[REDACTED_ANTHROPIC_KEY]')
    .replace(/AIza[A-Za-z0-9_-]{35}/g, '[REDACTED_GOOGLE_KEY]');

  // Truncate to first 200 chars for privacy
  const CONTEXT_MAX_LENGTH = 200;
  if (sanitized.length > CONTEXT_MAX_LENGTH) {
    sanitized = `${sanitized.slice(0, CONTEXT_MAX_LENGTH)}...`;
  }

  return sanitized;
}

function resolveMcpError(error: unknown): McpError | null {
  return error instanceof McpError ? error : null;
}

function resolveErrorCode(
  mcpError: McpError | null,
  fallbackCode: ErrorCodeType
): ErrorCodeType {
  return mcpError?.code ?? fallbackCode;
}

function resolveErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function resolveErrorDetails(
  mcpError: McpError | null
): Record<string, unknown> | undefined {
  return mcpError?.details;
}

// Default recovery hints for common error codes
const DEFAULT_RECOVERY_HINTS: Partial<Record<ErrorCodeType, string>> = {
  E_INVALID_INPUT: 'Check the input parameters and try again.',
  E_LLM_FAILED:
    'Retry the request. If the issue persists, check LLM provider status.',
  E_LLM_RATE_LIMITED:
    'Wait a few seconds and retry. Consider reducing request frequency.',
  E_LLM_AUTH_FAILED:
    'Verify your API key is correct and has sufficient permissions.',
  E_TIMEOUT:
    'The request timed out. Try again with a shorter prompt or increase timeout.',
};

function resolveRecoveryHint(mcpError: McpError | null): string | undefined {
  if (mcpError?.recoveryHint) return mcpError.recoveryHint;
  if (mcpError?.code) return DEFAULT_RECOVERY_HINTS[mcpError.code];
  return undefined;
}

function resolveSafeContext(context?: string): string | undefined {
  return config.INCLUDE_ERROR_CONTEXT
    ? sanitizeErrorContext(context)
    : undefined;
}

function buildStructuredError(
  code: ErrorCodeType,
  message: string,
  safeContext: string | undefined,
  details: Record<string, unknown> | undefined,
  recoveryHint: string | undefined
): ErrorResponse['structuredContent'] {
  return {
    ok: false as const,
    error: {
      code,
      message,
      context: safeContext,
      ...(details && { details }),
      ...(recoveryHint ? { recoveryHint } : {}),
    },
  };
}

export function createErrorResponse(
  error: unknown,
  fallbackCode: ErrorCodeType = ErrorCode.E_LLM_FAILED,
  context?: string
): ErrorResponse {
  const mcpError = resolveMcpError(error);
  const code = resolveErrorCode(mcpError, fallbackCode);
  const message = resolveErrorMessage(error);
  const details = resolveErrorDetails(mcpError);
  const recoveryHint = resolveRecoveryHint(mcpError);
  const safeContext = resolveSafeContext(context);
  const structuredError = buildStructuredError(
    code,
    message,
    safeContext,
    details,
    recoveryHint
  );

  return {
    content: [{ type: 'text', text: `Error [${code}]: ${message}` }],
    structuredContent: structuredError,
    isError: true,
  };
}

export { ErrorCode };
