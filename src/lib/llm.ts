import { LLM_MAX_TOKENS, LLM_TIMEOUT_MS } from '../config/constants.js';
import type { OptimizationTechnique, TargetFormat } from '../config/types.js';
import { getLLMClient } from './llm-client.js';
import { buildRefinementPrompt } from './technique-templates.js';
import { validateLLMOutput } from './validation.js';

// Creates an AbortSignal that automatically aborts after the specified timeout
function createTimeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

function combineSignals(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeoutSignal = createTimeoutSignal(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

export async function refineLLM(
  prompt: string,
  technique: OptimizationTechnique,
  targetFormat: TargetFormat,
  maxTokens = LLM_MAX_TOKENS,
  timeoutMs = LLM_TIMEOUT_MS,
  signal?: AbortSignal
): Promise<string> {
  const client = await getLLMClient();
  const refinementPrompt = buildRefinementPrompt(
    prompt,
    technique,
    targetFormat
  );

  const combinedSignal = combineSignals(timeoutMs, signal);
  const refined = await client.generateText(refinementPrompt, maxTokens, {
    timeoutMs,
    signal: combinedSignal,
  });

  const validated = validateLLMOutput(refined);

  return validated;
}
