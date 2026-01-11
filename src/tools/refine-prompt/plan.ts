import type { OptimizationTechnique } from '../../config/types.js';
import { STRICT_REFINEMENT_RULES } from './constants.js';
import type { RefinementAttemptPlan } from './types.js';

export function buildRefinementPlan(
  technique: OptimizationTechnique
): RefinementAttemptPlan[] {
  const plan: RefinementAttemptPlan[] = [
    { technique, usedFallback: false },
    {
      technique,
      extraInstructions: STRICT_REFINEMENT_RULES,
      usedFallback: true,
    },
  ];

  if (technique !== 'basic') {
    plan.push({
      technique: 'basic',
      extraInstructions: STRICT_REFINEMENT_RULES,
      usedFallback: true,
    });
  }

  return plan;
}
