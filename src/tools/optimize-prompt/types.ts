import type {
  OptimizationTechnique,
  OptimizeResponse,
  TargetFormat,
} from '../../config/types.js';

export type ConcreteTechnique = Exclude<OptimizationTechnique, 'comprehensive'>;

export interface OptimizePromptInput {
  prompt: string;
  techniques?: readonly OptimizationTechnique[];
  targetFormat?: TargetFormat;
}

export interface ResolvedOptimizeInputs {
  readonly validatedPrompt: string;
  readonly effectiveTechniques: readonly ConcreteTechnique[];
  readonly resolvedFormat: TargetFormat;
}

export interface OptimizeValidationConfig {
  readonly allowedTechniques: readonly ConcreteTechnique[];
  readonly targetFormat: TargetFormat;
}

export interface OptimizationMeta {
  readonly usedFallback: boolean;
  readonly scoreAdjusted: boolean;
  readonly overallSource: 'llm' | 'server';
}

export interface OptimizationScoreSummary {
  result: OptimizeResponse;
  scoreAdjusted: boolean;
  overallSource: 'llm' | 'server';
}
