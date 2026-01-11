import type {
  OptimizeResponse,
  ProviderInfo,
  TargetFormat,
} from '../../config/types.js';
import { createSuccessResponse } from '../../lib/errors.js';
import { normalizeScore } from '../../lib/output-normalization.js';
import {
  asBulletList,
  asCodeBlock,
  buildOutput,
  formatProviderLine,
} from '../../lib/tool-formatters.js';
import type { OptimizationMeta, OptimizationScoreSummary } from './types.js';

function formatImprovements(improvements: readonly string[]): string[] {
  const cleaned = improvements.map((item) => item.trim()).filter(Boolean);
  return asBulletList(cleaned);
}

function formatScoreLines(
  before: OptimizeResponse['beforeScore'],
  after: OptimizeResponse['afterScore']
): string[] {
  const delta = after.overall - before.overall;
  let deltaText = 'Delta: 0';
  if (delta !== 0) {
    const sign = delta > 0 ? '+' : '';
    deltaText = `Delta: ${sign}${delta}`;
  }

  const beforeLine =
    `Before: ${before.overall}/100 (clarity ${before.clarity}, ` +
    `specificity ${before.specificity}, completeness ${before.completeness}, ` +
    `structure ${before.structure}, effectiveness ${before.effectiveness})`;
  const afterLine =
    `After: ${after.overall}/100 (clarity ${after.clarity}, ` +
    `specificity ${after.specificity}, completeness ${after.completeness}, ` +
    `structure ${after.structure}, effectiveness ${after.effectiveness})`;

  return asBulletList([beforeLine, afterLine, deltaText]);
}

function formatOptimizeOutput(
  optimizationResult: OptimizeResponse,
  targetFormat: TargetFormat,
  provider: ProviderInfo
): string {
  return buildOutput(
    'Prompt Optimization',
    [formatProviderLine(provider), `Target format: ${targetFormat}`],
    buildOptimizeSections(optimizationResult)
  );
}

function buildOptimizeSections(
  optimizationResult: OptimizeResponse
): { title: string; lines: string[] }[] {
  return [
    {
      title: 'Scores',
      lines: formatScoreLines(
        optimizationResult.beforeScore,
        optimizationResult.afterScore
      ),
    },
    {
      title: 'Techniques Applied',
      lines: asBulletList(optimizationResult.techniquesApplied),
    },
    {
      title: 'Improvements',
      lines: formatImprovements(optimizationResult.improvements),
    },
    {
      title: 'Optimized Prompt',
      lines: asCodeBlock(optimizationResult.optimized),
    },
  ];
}

export function normalizeOptimizationScores(
  result: OptimizeResponse
): OptimizationScoreSummary {
  const normalizedBefore = normalizeScore(result.beforeScore);
  const normalizedAfter = normalizeScore(result.afterScore);
  const scoreAdjusted = normalizedBefore.adjusted || normalizedAfter.adjusted;
  const overallSource = scoreAdjusted ? 'server' : 'llm';

  return {
    result: {
      ...result,
      beforeScore: normalizedBefore.score,
      afterScore: normalizedAfter.score,
    },
    scoreAdjusted,
    overallSource,
  };
}

export function buildOptimizeResponse(
  result: OptimizeResponse,
  original: string,
  targetFormat: TargetFormat,
  provider: ProviderInfo,
  meta: OptimizationMeta
): ReturnType<typeof createSuccessResponse> {
  const output = formatOptimizeOutput(result, targetFormat, provider);
  const structured = buildOptimizationPayload(
    result,
    original,
    targetFormat,
    provider,
    meta
  );
  return createSuccessResponse(output, structured);
}

function buildOptimizationPayload(
  result: OptimizeResponse,
  original: string,
  targetFormat: TargetFormat,
  provider: ProviderInfo,
  meta: OptimizationMeta
): Record<string, unknown> {
  const scoreDelta = result.afterScore.overall - result.beforeScore.overall;
  return {
    ok: true,
    original,
    optimized: result.optimized,
    techniquesApplied: result.techniquesApplied,
    targetFormat,
    beforeScore: result.beforeScore,
    afterScore: result.afterScore,
    improvements: result.improvements,
    usedFallback: meta.usedFallback,
    scoreAdjusted: meta.scoreAdjusted,
    overallSource: meta.overallSource,
    scoreDelta,
    provider: provider.provider,
    model: provider.model,
  };
}
