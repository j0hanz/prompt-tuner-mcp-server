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
  signal: AbortSignal;
  retryOnParseFailure: boolean;
  retryPromptSuffix: string;
}

function resolveContext(
  options: LLMToolOptions & {
    retryOnParseFailure?: boolean;
    retryPromptSuffix?: string;
  } = {}
): ResolvedContext {
  const merged = Object.assign(
    {},
    DEFAULT_LLM_OPTIONS,
    {
      retryOnParseFailure: false,
      retryPromptSuffix: STRICT_JSON_SUFFIX,
    },
    options
  );

  return {
    maxTokens: merged.maxTokens,
    timeoutMs: merged.timeoutMs,
    signal: buildAbortSignal(merged.timeoutMs, options.signal),
    retryOnParseFailure: merged.retryOnParseFailure,
    retryPromptSuffix: merged.retryPromptSuffix,
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
  const reqOptions = {
    maxTokens: ctx.maxTokens,
    timeoutMs: ctx.timeoutMs,
    signal: ctx.signal,
  };
  const parseCtx = { errorCode, debugLabel };

  try {
    const value = await attemptRequest(
      client,
      prompt,
      reqOptions,
      parseSchema,
      parseCtx
    );
    return { value, usedFallback: false };
  } catch (error) {
    if (shouldRetry(error, ctx.retryOnParseFailure)) {
      const value = await attemptRequest(
        client,
        prompt + ctx.retryPromptSuffix,
        reqOptions,
        parseSchema,
        parseCtx
      );
      return { value, usedFallback: true };
    }
    throw error;
  }
}
