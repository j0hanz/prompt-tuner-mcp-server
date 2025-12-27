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
  const { maxTokens, timeoutMs } = { ...DEFAULT_LLM_OPTIONS, ...options };
  const combinedSignal = buildAbortSignal(timeoutMs, options?.signal);

  const client = await getLLMClient();
  const retryOnParseFailure = options?.retryOnParseFailure ?? false;
  const retryPromptSuffix = options?.retryPromptSuffix ?? STRICT_JSON_SUFFIX;

  const request = async (requestPrompt: string): Promise<string> =>
    client.generateText(requestPrompt, maxTokens, {
      timeoutMs,
      signal: combinedSignal,
    });

  try {
    const response = await request(prompt);
    const value = parseJsonFromLlmResponse<T>(response, parseSchema, {
      errorCode,
      maxPreviewChars: 500,
      debugLabel,
    });
    return { value, usedFallback: false };
  } catch (error) {
    const shouldRetry =
      retryOnParseFailure &&
      error instanceof McpError &&
      error.details?.parseFailed === true;
    if (!shouldRetry) {
      throw error;
    }

    const response = await request(`${prompt}${retryPromptSuffix}`);
    const value = parseJsonFromLlmResponse<T>(response, parseSchema, {
      errorCode,
      maxPreviewChars: 500,
      debugLabel,
    });
    return { value, usedFallback: true };
  }
}
