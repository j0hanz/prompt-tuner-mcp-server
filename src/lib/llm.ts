import { LLM_MAX_TOKENS, LLM_TIMEOUT_MS } from '../config/constants.js';
import type { OptimizationTechnique, TargetFormat } from '../config/types.js';
import { ErrorCode, McpError } from './errors.js';
import { getLLMClient } from './llm-client.js';
import { withRetry } from './retry.js';
import { buildRefinementPrompt } from './technique-templates.js';
import { validateLLMOutput } from './validation.js';

function withAbortableTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | undefined;
  let completed = false;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      completed = true;
      controller.abort();
      reject(
        new McpError(
          ErrorCode.E_TIMEOUT,
          `LLM request timed out after ${timeoutMs}ms`
        )
      );
    }, timeoutMs);
  });

  return Promise.race([
    fn(controller.signal).then((result) => {
      completed = true;
      return result;
    }),
    timeoutPromise,
  ]).finally(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    if (!completed && !controller.signal.aborted) {
      controller.abort();
    }
  });
}

export async function refineLLM(
  prompt: string,
  technique: OptimizationTechnique,
  targetFormat: TargetFormat,
  maxTokens = LLM_MAX_TOKENS,
  timeoutMs = LLM_TIMEOUT_MS
): Promise<string> {
  const client = await getLLMClient();
  const refinementPrompt = buildRefinementPrompt(
    prompt,
    technique,
    targetFormat
  );

  const refined = await withRetry(
    async () => {
      return await withAbortableTimeout(
        async (signal) =>
          client.generateText(refinementPrompt, maxTokens, {
            timeoutMs,
            signal,
          }),
        timeoutMs
      );
    },
    {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 8000,
      totalTimeoutMs: 180000,
    }
  );

  const validated = validateLLMOutput(refined);

  return validated;
}
