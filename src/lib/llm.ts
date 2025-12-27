import { LLM_MAX_TOKENS, LLM_TIMEOUT_MS } from '../config/constants.js';
import type { OptimizationTechnique, TargetFormat } from '../config/types.js';
import { buildAbortSignal } from './abort-signals.js';
import { getLLMClient } from './llm-client.js';
import { buildRefinementPrompt } from './technique-templates.js';
import { validateLLMOutput } from './validation.js';

export async function refineLLM(
  prompt: string,
  technique: OptimizationTechnique,
  targetFormat: TargetFormat,
  maxTokens = LLM_MAX_TOKENS,
  timeoutMs = LLM_TIMEOUT_MS,
  signal?: AbortSignal,
  extraInstructions?: string
): Promise<string> {
  const client = await getLLMClient();
  const refinementPrompt = buildRefinementPrompt(
    prompt,
    technique,
    targetFormat,
    extraInstructions
  );

  const combinedSignal = buildAbortSignal(timeoutMs, signal);
  const refined = await client.generateText(refinementPrompt, maxTokens, {
    timeoutMs,
    signal: combinedSignal,
  });

  const validated = validateLLMOutput(refined);

  return validated;
}
