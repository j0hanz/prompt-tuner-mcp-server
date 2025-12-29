import type {
  ErrorCodeType,
  LLMClient,
  LLMToolOptions,
} from '../config/types.js';
import { buildAbortSignal } from './abort-signals.js';
import { McpError } from './errors.js';
import { getLLMClient } from './llm-client.js';
import { parseJsonFromLlmResponse } from './llm-json.js';

const DEFAULT_LLM_OPTIONS: Required<Omit<LLMToolOptions, 'signal'>> = {
  maxTokens: 1500,
  timeoutMs: 60000,
};

const STRICT_JSON_SUFFIX =
  '\n\nSTRICT JSON: Return only valid JSON. Do not include explanations, headers, or code fences.';

export interface JsonResponseResult<T> {
  value: T;
  usedFallback: boolean;
}

export function extractPromptFromInput(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  if (!('prompt' in input)) return undefined;
  const { prompt } = input as { prompt?: unknown };
  return typeof prompt === 'string' ? prompt : undefined;
}

interface ResolvedContext extends Required<Omit<LLMToolOptions, 'signal'>> {
  retryOnParseFailure: boolean;
  retryPromptSuffix: string;
}

function withDefault<T>(value: T | undefined, fallback: T): T {
  return value ?? fallback;
}

function createRequestOptions(
  ctx: ResolvedContext,
  signal?: AbortSignal
): {
  maxTokens: number;
  timeoutMs: number;
  signal: AbortSignal;
} {
  return {
    maxTokens: ctx.maxTokens,
    timeoutMs: ctx.timeoutMs,
    signal: buildAbortSignal(ctx.timeoutMs, signal),
  };
}

function resolveContext(
  options: LLMToolOptions & {
    retryOnParseFailure?: boolean;
    retryPromptSuffix?: string;
  } = {}
): ResolvedContext {
  return {
    maxTokens: withDefault(options.maxTokens, DEFAULT_LLM_OPTIONS.maxTokens),
    timeoutMs: withDefault(options.timeoutMs, DEFAULT_LLM_OPTIONS.timeoutMs),
    retryOnParseFailure: withDefault(options.retryOnParseFailure, false),
    retryPromptSuffix: withDefault(
      options.retryPromptSuffix,
      STRICT_JSON_SUFFIX
    ),
  };
}

async function attemptRequest<T>(
  client: LLMClient,
  prompt: string,
  options: { maxTokens: number; timeoutMs: number; signal: AbortSignal },
  parseSchema: (value: unknown) => T,
  context: { errorCode: ErrorCodeType; debugLabel: string }
): Promise<T> {
  const response = await client.generateText(prompt, options.maxTokens, {
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  });
  return parseJsonFromLlmResponse<T>(response, parseSchema, {
    errorCode: context.errorCode,
    maxPreviewChars: 500,
    debugLabel: context.debugLabel,
  });
}

function shouldRetry(error: unknown, retry: boolean): boolean {
  return (
    retry && error instanceof McpError && error.details?.parseFailed === true
  );
}

export async function executeLLMWithJsonResponse<T>(
  prompt: string,
  parseSchema: (value: unknown) => T,
  errorCode: ErrorCodeType,
  debugLabel: string,
  options?: LLMToolOptions & {
    retryOnParseFailure?: boolean;
    retryPromptSuffix?: string;
  }
): Promise<JsonResponseResult<T>> {
  const ctx = resolveContext(options);
  const client = await getLLMClient();
  const parseCtx = { errorCode, debugLabel };
  const requestOptions = (): {
    maxTokens: number;
    timeoutMs: number;
    signal: AbortSignal;
  } => createRequestOptions(ctx, options?.signal);
  const attempt = (requestPrompt: string): Promise<T> =>
    attemptRequest(
      client,
      requestPrompt,
      requestOptions(),
      parseSchema,
      parseCtx
    );

  try {
    const value = await attempt(prompt);
    return { value, usedFallback: false };
  } catch (error) {
    if (!shouldRetry(error, ctx.retryOnParseFailure)) throw error;
    const value = await attempt(prompt + ctx.retryPromptSuffix);
    return { value, usedFallback: true };
  }
}
