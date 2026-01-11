import type Anthropic from '@anthropic-ai/sdk';

import type OpenAI from 'openai';

import type { LLMRequestOptions } from '../../config/types.js';

export const DEFAULT_TIMEOUT_MS = 60000;

export function checkAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

function trimText(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function buildTimeoutOptions(options?: LLMRequestOptions): {
  timeout: number;
  signal?: AbortSignal;
} {
  const resolved: { timeout: number; signal?: AbortSignal } = {
    timeout: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };

  if (options?.signal !== undefined) {
    resolved.signal = options.signal;
  }

  return resolved;
}

export async function createCompletion<TResponse, TResult>(
  options: LLMRequestOptions | undefined,
  create: (requestOptions: {
    timeout: number;
    signal?: AbortSignal;
  }) => PromiseLike<TResponse>,
  extract: (response: TResponse) => TResult
): Promise<TResult> {
  const response = await create(buildTimeoutOptions(options));
  return extract(response);
}

export function buildOpenAIRequest(
  model: string,
  prompt: string,
  maxTokens: number
): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
  return {
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    temperature: 0.7,
    stream: false,
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
): Anthropic.Messages.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
  };
}

export function extractAnthropicText(
  response: Anthropic.Messages.Message
): string {
  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || !('text' in textBlock)) return '';
  return trimText(textBlock.text);
}
