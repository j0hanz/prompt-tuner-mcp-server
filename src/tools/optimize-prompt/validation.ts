import type {
  OptimizationTechnique,
  OptimizeResponse,
  TargetFormat,
} from '../../config/types.js';
import { normalizePromptText } from '../../lib/output-validation.js';
import {
  containsOutputScaffolding,
  validateTechniqueOutput,
} from '../../lib/output-validation.js';
import { validatePrompt } from '../../lib/validation.js';
import { isConcreteTechnique } from './inputs.js';
import type { ConcreteTechnique, OptimizeValidationConfig } from './types.js';

interface NormalizedOptimizationResult {
  normalized: OptimizeResponse;
  techniquesApplied: readonly OptimizationTechnique[];
  appliedConcrete: readonly ConcreteTechnique[];
}

function normalizeOptimizeResult(
  result: OptimizeResponse
): NormalizedOptimizationResult {
  const normalized = normalizePromptText(result.optimized);
  const techniquesApplied = Array.from(new Set(result.techniquesApplied));
  const appliedConcrete = techniquesApplied.filter(isConcreteTechnique);
  return {
    normalized: { ...result, optimized: normalized, techniquesApplied },
    techniquesApplied,
    appliedConcrete,
  };
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

function hasUnexpectedTechniques(
  techniquesApplied: readonly OptimizationTechnique[],
  allowedSet: ReadonlySet<ConcreteTechnique>
): boolean {
  return techniquesApplied.some(
    (technique) => technique !== 'comprehensive' && !allowedSet.has(technique)
  );
}

function validateAppliedTechniques(
  techniquesApplied: readonly OptimizationTechnique[],
  appliedConcrete: readonly ConcreteTechnique[],
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
  appliedTechniques: readonly ConcreteTechnique[],
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

function buildOptimizationFailure(
  result: OptimizeResponse,
  reason: string
): { ok: false; result: OptimizeResponse; reason: string } {
  return { ok: false, result, reason };
}

export function validateOptimizeResult(
  result: OptimizeResponse,
  config: OptimizeValidationConfig
): { ok: boolean; result: OptimizeResponse; reason?: string } {
  const normalizedResult = normalizeOptimizeResult(result);
  const { normalized, techniquesApplied, appliedConcrete } = normalizedResult;
  const allowedSet = new Set(config.allowedTechniques);

  const textIssue = validateOptimizedText(normalized);
  if (textIssue) {
    return buildOptimizationFailure(normalized, textIssue);
  }

  const techniqueIssue = validateAppliedTechniques(
    techniquesApplied,
    appliedConcrete,
    allowedSet
  );
  if (techniqueIssue) {
    return buildOptimizationFailure(normalized, techniqueIssue);
  }

  const outputIssue = validateTechniqueOutputs(
    normalized.optimized,
    appliedConcrete,
    config.targetFormat
  );
  if (outputIssue) {
    return buildOptimizationFailure(normalized, outputIssue);
  }

  return { ok: true, result: normalized };
}
