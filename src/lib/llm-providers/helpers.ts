import type Anthropic from '@anthropic-ai/sdk';

import type OpenAI from 'openai';

import type { LLMRequestOptions } from '../../config/types.js';

export const DEFAULT_TIMEOUT_MS = 60000;

export function checkAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

export function trimText(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

export function buildTimeoutOptions(options?: LLMRequestOptions): {
  timeout: number;
  signal?: AbortSignal;
} {
  return {
    timeout: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    signal: options?.signal,
  };
}

export async function createCompletion<TResponse, TResult>(
  options: LLMRequestOptions | undefined,
  create: (requestOptions: {
    timeout: number;
    signal?: AbortSignal;
  }) => Promise<TResponse>,
  extract: (response: TResponse) => TResult
): Promise<TResult> {
  const response = await create(buildTimeoutOptions(options));
  return extract(response);
}

export function buildOpenAIRequest(
  model: string,
  prompt: string,
  maxTokens: number
): OpenAI.Chat.Completions.ChatCompletionCreateParams {
  return {
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    temperature: 0.7,
  };
}

export function extractOpenAIText(
  response: OpenAI.Chat.Completions.ChatCompletion
): string {
  const choice = response.choices[0];
  if (!choice) return '';
  return trimText(choice.message.content);
}

export function buildAnthropicRequest(
  model: string,
  prompt: string,
  maxTokens: number
): Anthropic.Messages.MessageCreateParams {
  return {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };
}

export function extractAnthropicText(
  response: Anthropic.Messages.Message
): string {
  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || !('text' in textBlock)) return '';
  return trimText(textBlock.text);
}
