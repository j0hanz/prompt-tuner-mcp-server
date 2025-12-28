import type { OptimizationTechnique } from '../../config/types.js';
import { resolveFormat } from '../../lib/prompt-analysis.js';
import { COMPREHENSIVE_TECHNIQUE_ORDER } from './constants.js';
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
  techniques: OptimizationTechnique[] | undefined
): OptimizationTechnique[] {
  return techniques && techniques.length > 0 ? techniques : ['basic'];
}

export function resolveOptimizeInputs(
  input: OptimizePromptInput
): ResolvedOptimizeInputs {
  const requestedTechniques = resolveTechniques(input.techniques);
  const deepOptimization = requestedTechniques.includes('comprehensive');
  const effectiveTechniques = deepOptimization
    ? COMPREHENSIVE_TECHNIQUE_ORDER
    : requestedTechniques.filter(isConcreteTechnique);
  const resolvedFormat = resolveFormat(
    input.targetFormat ?? 'auto',
    input.prompt
  );

  return {
    validatedPrompt: input.prompt,
    effectiveTechniques,
    resolvedFormat,
  };
}
