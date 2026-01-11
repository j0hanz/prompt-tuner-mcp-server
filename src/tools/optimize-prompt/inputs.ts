import type { OptimizationTechnique } from '../../config/types.js';
import { resolveFormat } from '../../lib/prompt-analysis/format.js';
import { OptimizePromptInputSchema } from '../../schemas/inputs.js';
import {
  COMPREHENSIVE_TECHNIQUE_ORDER,
  DEFAULT_TECHNIQUES,
} from './constants.js';
import type {
  ConcreteTechnique,
  OptimizePromptInput,
  ResolvedOptimizeInputs,
} from './types.js';

export function isConcreteTechnique(
  technique: OptimizationTechnique
): technique is ConcreteTechnique {
  return technique !== 'comprehensive';
}

function resolveTechniques(
  techniques: readonly OptimizationTechnique[] | undefined
): readonly OptimizationTechnique[] {
  return techniques && techniques.length > 0 ? techniques : DEFAULT_TECHNIQUES;
}

export function resolveOptimizeInputs(
  input: OptimizePromptInput
): ResolvedOptimizeInputs {
  const parsed = OptimizePromptInputSchema.parse(input);
  const requested = resolveTechniques(parsed.techniques);
  const effectiveTechniques = requested.includes('comprehensive')
    ? [...COMPREHENSIVE_TECHNIQUE_ORDER]
    : requested.filter(isConcreteTechnique);

  return {
    validatedPrompt: parsed.prompt,
    effectiveTechniques,
    resolvedFormat: resolveFormat(parsed.targetFormat, parsed.prompt),
  };
}
