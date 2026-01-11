import type { AnalysisResponse, ProviderInfo } from '../../config/types.js';
import { createSuccessResponse } from '../../lib/errors.js';
import {
  mergeCharacteristics,
  normalizeScore,
} from '../../lib/output-normalization.js';
import { formatAnalysisOutput } from './formatters.js';

export function normalizeAnalysisResult(
  result: AnalysisResponse,
  prompt: string
): {
  analysisResult: AnalysisResponse;
  scoreAdjusted: boolean;
  overallSource: string;
} {
  const normalizedScore = normalizeScore(result.score);
  const characteristics = mergeCharacteristics(prompt, result.characteristics);
  const analysisResult: AnalysisResponse = {
    ...result,
    score: normalizedScore.score,
    characteristics,
  };
  const scoreAdjusted = normalizedScore.adjusted;
  const overallSource = scoreAdjusted ? 'server' : 'llm';
  return { analysisResult, scoreAdjusted, overallSource };
}

export function buildAnalysisResponse(
  analysisResult: AnalysisResponse,
  provider: ProviderInfo,
  meta: { usedFallback: boolean; scoreAdjusted: boolean; overallSource: string }
): ReturnType<typeof createSuccessResponse> {
  const output = formatAnalysisOutput(analysisResult, provider);
  return createSuccessResponse(output, {
    ok: true,
    hasTypos: analysisResult.characteristics.hasTypos,
    isVague: analysisResult.characteristics.isVague,
    missingContext: analysisResult.characteristics.missingContext,
    suggestions: analysisResult.suggestions,
    score: analysisResult.score,
    characteristics: analysisResult.characteristics,
    usedFallback: meta.usedFallback,
    scoreAdjusted: meta.scoreAdjusted,
    overallSource: meta.overallSource,
    provider: provider.provider,
    model: provider.model,
  });
}
