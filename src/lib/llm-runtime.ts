import { performance } from 'node:perf_hooks';

import type { LLMProvider } from '../config/types.js';
import {
  publishFailureEvent,
  publishSuccessEvent,
  resolveFailureDetails,
} from './llm-runtime-events.js';
import { executeAttempts } from './llm-runtime-retry.js';

export async function runGeneration(
  provider: LLMProvider,
  model: string,
  requestFn: () => Promise<string>,
  signal?: AbortSignal
): Promise<string> {
  const startPerf = performance.now();
  let attemptsUsed = 0;

  try {
    const { attemptsUsed: usedAttempts, content } = await executeAttempts(
      provider,
      requestFn,
      signal
    );
    attemptsUsed = usedAttempts;
    publishSuccessEvent(provider, model, attemptsUsed, startPerf);
    return content;
  } catch (error) {
    publishFailureEvent(
      provider,
      model,
      attemptsUsed,
      startPerf,
      resolveFailureDetails(error)
    );
    throw error;
  }
}
