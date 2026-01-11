import { ANALYSIS_MAX_TOKENS, LLM_TIMEOUT_MS } from '../../config/constants.js';
import type { AnalysisResponse, LLMToolOptions } from '../../config/types.js';
import { ErrorCode } from '../../lib/errors.js';
import { executeLLMWithJsonResponse } from '../../lib/tool-helpers.js';
import { AnalysisResponseSchema } from '../../schemas/llm-responses.js';
import { TOOL_NAME } from './constants.js';

export async function runAnalysis(
  analysisPrompt: string,
  signal?: AbortSignal
): Promise<{ result: AnalysisResponse; usedFallback: boolean }> {
  const options: LLMToolOptions & { retryOnParseFailure?: boolean } = {
    maxTokens: ANALYSIS_MAX_TOKENS,
    timeoutMs: LLM_TIMEOUT_MS,
    retryOnParseFailure: true,
    ...(signal !== undefined ? { signal } : {}),
  };

  const { value, usedFallback } =
    await executeLLMWithJsonResponse<AnalysisResponse>(
      analysisPrompt,
      (response) => AnalysisResponseSchema.parse(response),
      ErrorCode.E_LLM_FAILED,
      TOOL_NAME,
      options
    );
  return { result: value, usedFallback };
}
