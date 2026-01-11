import type {
  OptimizationTechnique,
  TargetFormat,
} from '../../config/types.js';

export interface RefinePromptInput {
  prompt: string;
  technique?: string;
  targetFormat?: string;
}

export interface ResolvedRefineInputs {
  validatedPrompt: string;
  validatedTechnique: OptimizationTechnique;
  resolvedFormat: TargetFormat;
}

export interface RefinementAttemptPlan {
  technique: OptimizationTechnique;
  extraInstructions?: string;
  usedFallback: boolean;
}
