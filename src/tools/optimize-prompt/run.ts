import { LLM_TIMEOUT_MS, OPTIMIZE_MAX_TOKENS } from '../../config/constants.js';
import type { OptimizeResponse } from '../../config/types.js';
import { ErrorCode } from '../../lib/errors.js';
import { executeLLMWithJsonResponse } from '../../lib/tool-helpers.js';
import { OptimizeResponseSchema } from '../../schemas/llm-responses.js';
import { TOOL_NAME } from './constants.js';
import type { OptimizationRunResult } from './types.js';

export async function runOptimization(
  optimizePrompt: string,
  signal: AbortSignal
): Promise<OptimizationRunResult> {
  const { value, usedFallback } =
    await executeLLMWithJsonResponse<OptimizeResponse>(
      optimizePrompt,
      (value) => OptimizeResponseSchema.parse(value),
      ErrorCode.E_LLM_FAILED,
      TOOL_NAME,
      {
        maxTokens: OPTIMIZE_MAX_TOKENS,
        timeoutMs: LLM_TIMEOUT_MS,
        signal,
        retryOnParseFailure: true,
      }
    );
  return { result: value, usedFallback };
}
