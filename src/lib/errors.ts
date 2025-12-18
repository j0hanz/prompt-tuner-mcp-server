import {
  ErrorCode,
  type ErrorCodeType,
  type ErrorResponse,
  type LogFormat,
  type LogLevel,
  type McpErrorOptions,
  type SuccessResponse,
} from '../config/types.js';

const RAW_LOG_FORMAT = process.env.LOG_FORMAT;
const LOG_FORMAT: LogFormat =
  RAW_LOG_FORMAT === 'json' || RAW_LOG_FORMAT === 'text'
    ? RAW_LOG_FORMAT
    : 'text';

if (RAW_LOG_FORMAT && RAW_LOG_FORMAT !== LOG_FORMAT) {
  console.error(
    `[WARN] Invalid LOG_FORMAT: "${RAW_LOG_FORMAT}". Defaulting to "text". Valid: json, text`
  );
}

const JSON_LOGGING = LOG_FORMAT === 'json';

function formatLogEntry(
  level: LogLevel,
  message: string,
  args: unknown[]
): string {
  if (JSON_LOGGING) {
    return JSON.stringify({
      level,
      message,
      args: args.length > 0 ? args : undefined,
      ts: new Date().toISOString(),
    });
  }
  const timestamp = new Date().toISOString();
  return `${timestamp} [${level.toUpperCase()}] ${message}`;
}

export const logger = {
  error: (message: string, ...args: unknown[]): void => {
    console.error(
      formatLogEntry('error', message, args),
      ...(!JSON_LOGGING ? args : [])
    );
  },
  warn: (message: string, ...args: unknown[]): void => {
    console.error(
      formatLogEntry('warn', message, args),
      ...(!JSON_LOGGING ? args : [])
    );
  },
  info: (message: string, ...args: unknown[]): void => {
    console.error(
      formatLogEntry('info', message, args),
      ...(!JSON_LOGGING ? args : [])
    );
  },
  debug: (message: string, ...args: unknown[]): void => {
    if (process.env.DEBUG === 'true') {
      console.error(
        formatLogEntry('debug', message, args),
        ...(!JSON_LOGGING ? args : [])
      );
    }
  },
} as const;

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

export function createErrorResponse(
  error: unknown,
  fallbackCode: ErrorCodeType = ErrorCode.E_LLM_FAILED,
  context?: string
): ErrorResponse {
  const code = error instanceof McpError ? error.code : fallbackCode;
  const message = error instanceof Error ? error.message : 'Unknown error';
  const details = error instanceof McpError ? error.details : undefined;

  const CONTEXT_MAX_LENGTH = 500;
  const includeContext = process.env.INCLUDE_ERROR_CONTEXT === 'true';

  const truncatedContext = context
    ? context.length > CONTEXT_MAX_LENGTH
      ? `${context.slice(0, CONTEXT_MAX_LENGTH)}...`
      : context
    : undefined;
  const safeContext = includeContext ? truncatedContext : undefined;

  const structuredError = {
    ok: false as const,
    error: {
      code,
      message,
      context: safeContext,
      ...(details && { details }),
      ...(error instanceof McpError && error.recoveryHint
        ? { recoveryHint: error.recoveryHint }
        : {}),
    },
  };

  return {
    content: [{ type: 'text', text: `Error [${code}]: ${message}` }],
    structuredContent: structuredError,
    isError: true,
  };
}

export { ErrorCode };
