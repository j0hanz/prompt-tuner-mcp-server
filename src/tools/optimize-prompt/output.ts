import type { OptimizeResponse, TargetFormat } from '../../config/types.js';
import { createSuccessResponse } from '../../lib/errors.js';
import {
  asBulletList,
  asCodeBlock,
  buildOutput,
  formatProviderLine,
} from '../../lib/tool-formatters.js';
import { buildPromptResourceBlock } from '../../lib/tool-resources.js';
import { formatImprovements } from './formatters.js';
import type { OptimizationMeta } from './types.js';

function formatScoreLines(
  before: OptimizeResponse['beforeScore'],
  after: OptimizeResponse['afterScore']
): string[] {
  const delta = after.overall - before.overall;
  const deltaText =
    delta === 0 ? 'Delta: 0' : `Delta: ${delta > 0 ? '+' : ''}${delta}`;

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
  provider: { provider: string; model: string }
): string {
  const meta = [formatProviderLine(provider), `Target format: ${targetFormat}`];

  return buildOutput('Prompt Optimization', meta, [
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
  ]);
}

export function buildOptimizeResponse(
  result: OptimizeResponse,
  original: string,
  targetFormat: TargetFormat,
  provider: { provider: string; model: string },
  meta: OptimizationMeta
): ReturnType<typeof createSuccessResponse> {
  const scoreDelta = result.afterScore.overall - result.beforeScore.overall;
  const output = formatOptimizeOutput(result, targetFormat, provider);
  const promptResource = buildPromptResourceBlock(
    result.optimized,
    `optimized-prompt-${targetFormat}`
  );
  return createSuccessResponse(
    output,
    {
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
    },
    [promptResource]
  );
}
