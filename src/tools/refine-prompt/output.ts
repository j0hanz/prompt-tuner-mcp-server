import type {
  OptimizationTechnique,
  ProviderInfo,
} from '../../config/types.js';
import { createSuccessResponse } from '../../lib/errors.js';
import {
  asBulletList,
  asCodeBlock,
  buildOutput,
  formatProviderLine,
} from '../../lib/tool-formatters.js';
import type { ResolvedRefineInputs } from './types.js';

function buildRefineOutput(
  refined: string,
  corrections: string[],
  input: ResolvedRefineInputs,
  techniqueUsed: OptimizationTechnique,
  provider: ProviderInfo
): string {
  const meta = [
    formatProviderLine(provider),
    `Technique: ${techniqueUsed}`,
    `Target format: ${input.resolvedFormat}`,
  ];

  return buildOutput('Prompt Refinement', meta, [
    { title: 'Refined Prompt', lines: asCodeBlock(refined) },
    { title: 'Changes', lines: asBulletList(corrections) },
  ]);
}

export function buildRefineResponse(
  refined: string,
  corrections: string[],
  input: ResolvedRefineInputs,
  techniqueUsed: OptimizationTechnique,
  usedFallback: boolean,
  provider: ProviderInfo
): ReturnType<typeof createSuccessResponse> {
  const output = buildRefineOutput(
    refined,
    corrections,
    input,
    techniqueUsed,
    provider
  );
  return createSuccessResponse(output, {
    ok: true,
    original: input.validatedPrompt,
    refined,
    corrections,
    technique: techniqueUsed,
    targetFormat: input.resolvedFormat,
    usedFallback,
    provider: provider.provider,
    model: provider.model,
  });
}
