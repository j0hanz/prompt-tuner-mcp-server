import type { ErrorCodeType, LLMToolOptions } from '../config/types.js';
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

function resolveOptions(
  options?: LLMToolOptions
): Required<Omit<LLMToolOptions, 'signal'>> {
  return { ...DEFAULT_LLM_OPTIONS, ...options };
}

function buildRequest(
  client: Awaited<ReturnType<typeof getLLMClient>>,
  maxTokens: number,
  timeoutMs: number,
  signal: AbortSignal
): (requestPrompt: string) => Promise<string> {
  return (requestPrompt: string): Promise<string> =>
    client.generateText(requestPrompt, maxTokens, {
      timeoutMs,
      signal,
    });
}

function parseResponse<T>(
  response: string,
  parseSchema: (value: unknown) => T,
  errorCode: ErrorCodeType,
  debugLabel: string
): T {
  return parseJsonFromLlmResponse<T>(response, parseSchema, {
    errorCode,
    maxPreviewChars: 500,
    debugLabel,
  });
}

function shouldRetryParseFailure(
  error: unknown,
  retryOnParseFailure: boolean
): boolean {
  return (
    retryOnParseFailure &&
    error instanceof McpError &&
    error.details?.parseFailed === true
  );
}

async function requestAndParse<T>(
  request: (prompt: string) => Promise<string>,
  prompt: string,
  parseSchema: (value: unknown) => T,
  errorCode: ErrorCodeType,
  debugLabel: string
): Promise<T> {
  const response = await request(prompt);
  return parseResponse(response, parseSchema, errorCode, debugLabel);
}

async function executeWithOptionalRetry<T>(
  request: (prompt: string) => Promise<string>,
  prompt: string,
  parseSchema: (value: unknown) => T,
  errorCode: ErrorCodeType,
  debugLabel: string,
  retryConfig: { retryOnParseFailure: boolean; retryPromptSuffix: string }
): Promise<JsonResponseResult<T>> {
  try {
    const value = await requestAndParse(
      request,
      prompt,
      parseSchema,
      errorCode,
      debugLabel
    );
    return { value, usedFallback: false };
  } catch (error) {
    if (!shouldRetryParseFailure(error, retryConfig.retryOnParseFailure)) {
      throw error;
    }

    const value = await requestAndParse(
      request,
      `${prompt}${retryConfig.retryPromptSuffix}`,
      parseSchema,
      errorCode,
      debugLabel
    );
    return { value, usedFallback: true };
  }
}

function resolveRetryConfig(options?: {
  retryOnParseFailure?: boolean;
  retryPromptSuffix?: string;
}): { retryOnParseFailure: boolean; retryPromptSuffix: string } {
  return {
    retryOnParseFailure: options?.retryOnParseFailure ?? false,
    retryPromptSuffix: options?.retryPromptSuffix ?? STRICT_JSON_SUFFIX,
  };
}

function resolveExecutionContext(
  options?: LLMToolOptions & {
    retryOnParseFailure?: boolean;
    retryPromptSuffix?: string;
  }
): {
  resolvedOptions: Required<Omit<LLMToolOptions, 'signal'>>;
  combinedSignal: AbortSignal;
  retryConfig: { retryOnParseFailure: boolean; retryPromptSuffix: string };
} {
  const resolvedOptions = resolveOptions(options);
  return {
    resolvedOptions,
    combinedSignal: buildAbortSignal(
      resolvedOptions.timeoutMs,
      options?.signal
    ),
    retryConfig: resolveRetryConfig(options),
  };
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
  const { resolvedOptions, combinedSignal, retryConfig } =
    resolveExecutionContext(options);
  const client = await getLLMClient();
  const request = buildRequest(
    client,
    resolvedOptions.maxTokens,
    resolvedOptions.timeoutMs,
    combinedSignal
  );
  return executeWithOptionalRetry(
    request,
    prompt,
    parseSchema,
    errorCode,
    debugLabel,
    retryConfig
  );
}
