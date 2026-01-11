import { inspect } from 'node:util';

import pino from 'pino';
import { z, type ZodError } from 'zod';

import { config } from '../config/env.js';
import {
  type ContentBlock,
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

    if (contextOrOptions && typeof contextOrOptions === 'object') {
      if (contextOrOptions.context !== undefined) {
        this.context = contextOrOptions.context;
      }
      if (contextOrOptions.details !== undefined) {
        this.details = contextOrOptions.details;
      }
      if (contextOrOptions.recoveryHint !== undefined) {
        this.recoveryHint = contextOrOptions.recoveryHint;
      }
    } else {
      if (contextOrOptions !== undefined) {
        this.context = contextOrOptions;
      }
      if (details !== undefined) {
        this.details = details;
      }
      if (recoveryHint !== undefined) {
        this.recoveryHint = recoveryHint;
      }
    }
  }

  [inspect.custom](): string {
    const hint = this.recoveryHint ? ` (Hint: ${this.recoveryHint})` : '';
    const details = this.details ? ` ${JSON.stringify(this.details)}` : '';
    return `McpError[${this.code}]: ${this.message}${hint}${details}`;
  }
}

export function createSuccessResponse<T extends Record<string, unknown>>(
  text: string,
  structured: T,
  extraContent: readonly ContentBlock[] = []
): SuccessResponse<T> {
  const structuredBlock: ContentBlock = {
    type: 'text',
    text: JSON.stringify(structured),
  };
  const messageBlock: ContentBlock = { type: 'text', text };
  return {
    content: [structuredBlock, messageBlock, ...extraContent],
    structuredContent: structured,
  };
}

interface StructuredErrorPayload {
  code: ErrorCodeType;
  message: string;
  context?: string;
  details?: Record<string, unknown>;
  recoveryHint?: string;
}

function buildZodStructuredError(
  error: unknown,
  context?: string
): StructuredErrorPayload | null {
  if (!isZodError(error)) return null;

  const safeContext = resolveSafeContext(context);
  const prettyMessage = z.prettifyError(error);
  const recoveryHint = DEFAULT_RECOVERY_HINTS[ErrorCode.E_INVALID_INPUT];
  return {
    code: ErrorCode.E_INVALID_INPUT,
    message: prettyMessage,
    ...(safeContext ? { context: safeContext } : {}),
    details: { issues: error.issues },
    ...(recoveryHint !== undefined ? { recoveryHint } : {}),
  };
}

function buildGenericStructuredError(
  error: unknown,
  fallbackCode: ErrorCodeType,
  context?: string
): StructuredErrorPayload {
  const mcpError = resolveMcpError(error);
  const code = resolveStructuredCode(mcpError, fallbackCode);
  const message = resolveStructuredMessage(mcpError, error);
  const safeContext = resolveSafeContext(context);
  const details = resolveErrorDetails(mcpError);
  const recoveryHint = resolveRecoveryHint(mcpError);

  const payload: StructuredErrorPayload = { code, message };
  if (safeContext) payload.context = safeContext;
  if (details) payload.details = details;
  if (recoveryHint) payload.recoveryHint = recoveryHint;
  return payload;
}

function resolveStructuredCode(
  mcpError: McpError | null,
  fallbackCode: ErrorCodeType
): ErrorCodeType {
  return mcpError?.code ?? fallbackCode;
}

function resolveStructuredMessage(
  mcpError: McpError | null,
  error: unknown
): string {
  return mcpError?.message ?? resolveErrorMessage(error);
}

function buildStructuredError(
  error: unknown,
  fallbackCode: ErrorCodeType,
  context?: string
): StructuredErrorPayload {
  return (
    buildZodStructuredError(error, context) ??
    buildGenericStructuredError(error, fallbackCode, context)
  );
}

export function createErrorResponse(
  error: unknown,
  fallbackCode: ErrorCodeType = ErrorCode.E_LLM_FAILED,
  context?: string
): ErrorResponse {
  const structuredError = buildStructuredError(error, fallbackCode, context);
  const structured: ErrorResponse['structuredContent'] = {
    ok: false,
    error: structuredError,
  };
  return {
    content: [
      { type: 'text', text: JSON.stringify(structured) },
      { type: 'text', text: `Error: ${structuredError.message}` },
    ],
    structuredContent: structured,
    isError: true,
  };
}

function sanitizeErrorContext(context?: string): string | undefined {
  if (!context) return undefined;

  let sanitized = context
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, '[REDACTED_OPENAI_KEY]')
    .replace(/sk-ant-[A-Za-z0-9_-]{20,}/g, '[REDACTED_ANTHROPIC_KEY]')
    .replace(/AIza[A-Za-z0-9_-]{35}/g, '[REDACTED_GOOGLE_KEY]');

  const CONTEXT_MAX_LENGTH = 200;
  if (sanitized.length > CONTEXT_MAX_LENGTH) {
    sanitized = `${sanitized.slice(0, CONTEXT_MAX_LENGTH)}...`;
  }

  return sanitized;
}

function resolveMcpError(error: unknown): McpError | null {
  return error instanceof McpError ? error : null;
}

function resolveErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function resolveErrorDetails(
  mcpError: McpError | null
): Record<string, unknown> | undefined {
  return mcpError?.details;
}

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

export { ErrorCode };

function isZodError(error: unknown): error is ZodError {
  return error instanceof z.ZodError;
}
