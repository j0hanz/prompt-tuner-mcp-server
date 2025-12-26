import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import type {
  ErrorCodeType,
  LLMError,
  LLMProvider,
  SafeErrorDetails,
  ValidProvider,
} from '../config/types.js';
import { ErrorCode, logger, McpError } from './errors.js';
import { withRetry } from './retry.js';

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
      `Check ${PROVIDER_ENV_KEYS[provider as ValidProvider]} environment variable`
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

export async function runGeneration(
  provider: LLMProvider,
  requestFn: () => Promise<string>
): Promise<string> {
  return withRetry(async () => {
    const start = performance.now();
    try {
      const content = await requestFn();
      assert.ok(
        content,
        'LLM returned empty response (possibly blocked or filtered)'
      );

      const durationMs = performance.now() - start;
      logger.debug(
        `LLM generation (${provider}) took ${durationMs.toFixed(2)}ms`
      );

      return content;
    } catch (error) {
      throw classifyLLMError(error, provider);
    }
  });
}
