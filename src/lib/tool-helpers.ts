import type { ErrorCodeType, LLMToolOptions } from '../config/types.js';
import { buildAbortSignal } from './abort-signals.js';
import { getLLMClient } from './llm-client.js';
import { parseJsonFromLlmResponse } from './llm-json.js';

const DEFAULT_LLM_OPTIONS: Required<Omit<LLMToolOptions, 'signal'>> = {
  maxTokens: 1500,
  timeoutMs: 60000,
};

export async function executeLLMWithJsonResponse<T>(
  prompt: string,
  parseSchema: (value: unknown) => T,
  errorCode: ErrorCodeType,
  debugLabel: string,
  options?: LLMToolOptions
): Promise<T> {
  const { maxTokens, timeoutMs } = { ...DEFAULT_LLM_OPTIONS, ...options };
  const combinedSignal = buildAbortSignal(timeoutMs, options?.signal);

  const client = await getLLMClient();
  const response = await client.generateText(prompt, maxTokens, {
    timeoutMs,
    signal: combinedSignal,
  });

  return parseJsonFromLlmResponse<T>(response, parseSchema, {
    errorCode,
    maxPreviewChars: 500,
    debugLabel,
  });
}
