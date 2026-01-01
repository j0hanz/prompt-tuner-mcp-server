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

interface ResolvedRequestOptions {
  maxTokens: number;
  timeoutMs: number;
  signal?: AbortSignal;
  retryOnParseFailure: boolean;
  retryPromptSuffix: string;
}

export function extractPromptFromInput(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const { prompt } = input as { prompt?: unknown };
  return typeof prompt === 'string' ? prompt : undefined;
}

function resolveRequestOptions(
  options: LLMToolOptions & {
    retryOnParseFailure?: boolean;
    retryPromptSuffix?: string;
  }
): ResolvedRequestOptions {
  const {
    maxTokens = DEFAULT_MAX_TOKENS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
    retryOnParseFailure = false,
    retryPromptSuffix = STRICT_JSON_SUFFIX,
  } = options;

  return {
    maxTokens,
    timeoutMs,
    signal,
    retryOnParseFailure,
    retryPromptSuffix,
  };
}

function buildRequestContext(options: ResolvedRequestOptions): RequestContext {
  return {
    maxTokens: options.maxTokens,
    timeoutMs: options.timeoutMs,
    signal: buildAbortSignal(options.timeoutMs, options.signal),
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
  const resolved = resolveRequestOptions(options);
  const buildCtx = (): RequestContext => buildRequestContext(resolved);
  const client = await getLLMClient();

  try {
    const value = await runAndParse(
      prompt,
      client,
      buildCtx(),
      parseSchema,
      errorCode,
      debugLabel
    );
    return { value, usedFallback: false };
  } catch (error) {
    if (!shouldRetryParse(error, resolved.retryOnParseFailure)) throw error;
    const value = await runAndParse(
      prompt + resolved.retryPromptSuffix,
      client,
      buildCtx(),
      parseSchema,
      errorCode,
      debugLabel
    );
    return { value, usedFallback: true };
  }
}
