import type {
  OptimizationTechnique,
  TargetFormat,
} from '../../config/types.js';
import {
  containsOutputScaffolding,
  validateTechniqueOutput,
} from '../../lib/output-validation.js';
import { validatePrompt } from '../../lib/validation.js';

function validatePromptOutput(output: string): string | null {
  try {
    validatePrompt(output);
    return null;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : 'Refined prompt is empty or invalid';
  }
}

function validateScaffolding(output: string): string | null {
  return containsOutputScaffolding(output)
    ? 'Output contains scaffolding or formatting'
    : null;
}

function validateTechnique(
  output: string,
  technique: OptimizationTechnique,
  targetFormat: TargetFormat
): string | null {
  const validation = validateTechniqueOutput(output, technique, targetFormat);
  return validation.ok ? null : (validation.reason ?? 'Validation failed');
}

export function validateRefinedOutput(
  output: string,
  technique: OptimizationTechnique,
  targetFormat: TargetFormat
): string | null {
  const checks = [
    validatePromptOutput(output),
    validateScaffolding(output),
    validateTechnique(output, technique, targetFormat),
  ];
  return checks.find((issue) => issue !== null) ?? null;
}
