import type {
  OptimizationTechnique,
  OptimizeResponse,
  TargetFormat,
} from '../../config/types.js';
import {
  containsOutputScaffolding,
  normalizePromptText,
  validateTechniqueOutput,
} from '../../lib/output-validation.js';
import { validatePrompt } from '../../lib/validation.js';
import { isConcreteTechnique } from './inputs.js';
import type { ConcreteTechnique, OptimizeValidationConfig } from './types.js';

function normalizeTechniques(
  techniques: OptimizationTechnique[]
): OptimizationTechnique[] {
  return Array.from(new Set(techniques));
}

function normalizeOptimizeResult(result: OptimizeResponse): {
  normalized: OptimizeResponse;
  techniquesApplied: OptimizationTechnique[];
  appliedConcrete: ConcreteTechnique[];
} {
  const { normalized } = normalizePromptText(result.optimized);
  const techniquesApplied = normalizeTechniques(result.techniquesApplied);
  const appliedConcrete = techniquesApplied.filter(isConcreteTechnique);
  return {
    normalized: { ...result, optimized: normalized, techniquesApplied },
    techniquesApplied,
    appliedConcrete,
  };
}

function hasUnexpectedTechniques(
  techniquesApplied: OptimizationTechnique[],
  allowedSet: ReadonlySet<ConcreteTechnique>
): boolean {
  return techniquesApplied.some(
    (technique) => technique !== 'comprehensive' && !allowedSet.has(technique)
  );
}

function validateAppliedTechniques(
  techniquesApplied: OptimizationTechnique[],
  appliedConcrete: ConcreteTechnique[],
  allowedSet: ReadonlySet<ConcreteTechnique>
): string | null {
  if (hasUnexpectedTechniques(techniquesApplied, allowedSet)) {
    return 'Unexpected techniques reported';
  }
  if (!appliedConcrete.length) {
    return 'No techniques applied';
  }
  return null;
}

function validateTechniqueOutputs(
  text: string,
  appliedTechniques: ConcreteTechnique[],
  targetFormat: TargetFormat
): string | null {
  for (const technique of appliedTechniques) {
    const validation = validateTechniqueOutput(text, technique, targetFormat);
    if (!validation.ok) {
      return validation.reason ?? 'Technique validation failed';
    }
  }
  return null;
}

function validateOptimizedText(normalized: OptimizeResponse): string | null {
  try {
    validatePrompt(normalized.optimized);
  } catch (error) {
    return error instanceof Error
      ? error.message
      : 'Optimized prompt is empty or invalid';
  }

  if (containsOutputScaffolding(normalized.optimized)) {
    return 'Output contains optimization scaffolding';
  }

  return null;
}

function buildFailure(
  normalized: OptimizeResponse,
  reason: string
): { ok: false; result: OptimizeResponse; reason: string } {
  return { ok: false, result: normalized, reason };
}

export function validateOptimizeResult(
  result: OptimizeResponse,
  config: OptimizeValidationConfig
): { ok: boolean; result: OptimizeResponse; reason?: string } {
  const normalizedResult = normalizeOptimizeResult(result);
  const allowedSet = new Set(config.allowedTechniques);

  const textIssue = validateOptimizedText(normalizedResult.normalized);
  if (textIssue) {
    return buildFailure(normalizedResult.normalized, textIssue);
  }

  const techniqueIssue = validateAppliedTechniques(
    normalizedResult.techniquesApplied,
    normalizedResult.appliedConcrete,
    allowedSet
  );
  if (techniqueIssue) {
    return buildFailure(normalizedResult.normalized, techniqueIssue);
  }

  const outputIssue = validateTechniqueOutputs(
    normalizedResult.normalized.optimized,
    normalizedResult.appliedConcrete,
    config.targetFormat
  );
  if (outputIssue) {
    return buildFailure(normalizedResult.normalized, outputIssue);
  }

  return { ok: true, result: normalizedResult.normalized };
}
