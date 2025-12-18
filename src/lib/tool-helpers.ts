import type { ErrorCodeType, LLMToolOptions } from '../config/types.js';
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

  const client = await getLLMClient();
  const response = await client.generateText(prompt, maxTokens, {
    timeoutMs,
    signal: options?.signal,
  });

  return parseJsonFromLlmResponse<T>(response, parseSchema, {
    errorCode,
    maxPreviewChars: 500,
    debugLabel,
  });
}

export function formatScoreList(
  scores: Record<string, number>,
  suffix = '/100'
): string {
  return Object.entries(scores)
    .map(([key, value]) => `- **${capitalizeFirst(key)}**: ${value}${suffix}`)
    .join('\n');
}

function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
