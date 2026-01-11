import { config } from '../config/env.js';
import type {
  ErrorCodeType,
  LLMError,
  LLMProvider,
  SafeErrorDetails,
} from '../config/types.js';
import { ErrorCode, McpError } from './errors.js';

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

export function coerceMcpError(
  error: unknown,
  provider: LLMProvider
): McpError {
  if (error instanceof McpError) return error;
  return classifyLLMError(error, provider);
}

export const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
export const NON_RETRYABLE_CODES = new Set<ErrorCodeType>([
  ErrorCode.E_LLM_AUTH_FAILED,
  ErrorCode.E_INVALID_INPUT,
]);

export function resolveRetrySettings(): {
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
