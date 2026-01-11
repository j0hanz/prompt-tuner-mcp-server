import type { LLMProvider, LLMRequestOptions } from '../config/types.js';
import { createCompletion } from './llm-providers/helpers.js';
import { runGeneration } from './llm-runtime.js';

export function runTextCompletion<TResponse>(
  provider: LLMProvider,
  model: string,
  options: LLMRequestOptions | undefined,
  create: (requestOptions: {
    timeout: number;
    signal?: AbortSignal;
  }) => PromiseLike<TResponse>,
  extract: (response: TResponse) => string
): Promise<string> {
  return runGeneration(
    provider,
    model,
    () => createCompletion(options, create, extract),
    options?.signal
  );
}
