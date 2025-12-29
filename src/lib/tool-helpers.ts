import type { ErrorCodeType, LLMToolOptions } from '../config/types.js';
import { buildAbortSignal } from './abort-signals.js';
import { McpError } from './errors.js';
import { getLLMClient } from './llm-client.js';
import { parseJsonFromLlmResponse } from './llm-json.js';

const DEFAULT_MAX_TOKENS = 1500;
const DEFAULT_TIMEOUT_MS = 60000;
const STRICT_JSON_SUFFIX =
  '\n\nSTRICT JSON: Return only valid JSON. Do not include explanations, headers, or code fences.';

interface RequestContext {
  maxTokens: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

export function extractPromptFromInput(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const { prompt } = input as { prompt?: unknown };
  return typeof prompt === 'string' ? prompt : undefined;
}

function buildRequestContext(
  options: LLMToolOptions & {
    retryOnParseFailure?: boolean;
    retryPromptSuffix?: string;
  }
): {
  ctx: RequestContext;
  retryOnParseFailure: boolean;
  retryPromptSuffix: string;
} {
  const {
    maxTokens = DEFAULT_MAX_TOKENS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
    retryOnParseFailure = false,
    retryPromptSuffix = STRICT_JSON_SUFFIX,
  } = options;

  return {
    ctx: {
      maxTokens,
      timeoutMs,
      signal: buildAbortSignal(timeoutMs, signal),
    },
    retryOnParseFailure,
    retryPromptSuffix,
  };
}

async function runAndParse<T>(
  prompt: string,
  client: Awaited<ReturnType<typeof getLLMClient>>,
  request: RequestContext,
  parseSchema: (value: unknown) => T,
  errorCode: ErrorCodeType,
  debugLabel: string
): Promise<T> {
  const response = await client.generateText(
    prompt,
    request.maxTokens,
    request
  );

  return parseJsonFromLlmResponse<T>(response, parseSchema, {
    errorCode,
    maxPreviewChars: 500,
    debugLabel,
  });
}

function shouldRetryParse(error: unknown, allowRetry: boolean): boolean {
  return (
    allowRetry &&
    error instanceof McpError &&
    error.details?.parseFailed === true
  );
}

export async function executeLLMWithJsonResponse<T>(
  prompt: string,
  parseSchema: (value: unknown) => T,
  errorCode: ErrorCodeType,
  debugLabel: string,
  options: LLMToolOptions & {
    retryOnParseFailure?: boolean;
    retryPromptSuffix?: string;
  } = {}
): Promise<{ value: T; usedFallback: boolean }> {
  const { ctx, retryOnParseFailure, retryPromptSuffix } =
    buildRequestContext(options);
  const client = await getLLMClient();

  try {
    const value = await runAndParse(
      prompt,
      client,
      ctx,
      parseSchema,
      errorCode,
      debugLabel
    );
    return { value, usedFallback: false };
  } catch (error) {
    if (!shouldRetryParse(error, retryOnParseFailure)) throw error;
    const value = await runAndParse(
      prompt + retryPromptSuffix,
      client,
      ctx,
      parseSchema,
      errorCode,
      debugLabel
    );
    return { value, usedFallback: true };
  }
}
