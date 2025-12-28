import type {
  OptimizationTechnique,
  OptimizeResponse,
  TargetFormat,
} from '../../config/types.js';

export type ConcreteTechnique = Exclude<OptimizationTechnique, 'comprehensive'>;

export interface OptimizePromptInput {
  prompt: string;
  techniques?: OptimizationTechnique[];
  targetFormat?: TargetFormat;
}

export interface ResolvedOptimizeInputs {
  validatedPrompt: string;
  effectiveTechniques: ConcreteTechnique[];
  resolvedFormat: TargetFormat;
}

export interface OptimizeValidationConfig {
  allowedTechniques: ConcreteTechnique[];
  targetFormat: TargetFormat;
}

export interface OptimizationMeta {
  usedFallback: boolean;
  scoreAdjusted: boolean;
  overallSource: 'llm' | 'server';
}

export interface OptimizationRunResult {
  result: OptimizeResponse;
  usedFallback: boolean;
}
