import { LLM_MAX_TOKENS, LLM_TIMEOUT_MS } from '../config/constants.js';
import type { OptimizationTechnique, TargetFormat } from '../config/types.js';
import { getLLMClient } from './llm-client.js';
import { buildRefinementPrompt } from './technique-templates.js';
import { validateLLMOutput } from './validation.js';

// Creates an AbortSignal that automatically aborts after the specified timeout
function createTimeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
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

  const signal = createTimeoutSignal(timeoutMs);
  const refined = await client.generateText(refinementPrompt, maxTokens, {
    timeoutMs,
    signal,
  });

  const validated = validateLLMOutput(refined);

  return validated;
}
