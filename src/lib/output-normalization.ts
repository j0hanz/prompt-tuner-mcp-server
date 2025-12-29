import { SCORING_WEIGHTS } from '../config/constants.js';
import type {
  AnalysisCharacteristics,
  OptimizeScore,
} from '../config/types.js';
import {
  buildPatternCache,
  detectTargetFormat,
} from './prompt-analysis/format.js';

const SCORE_KEYS = [
  'clarity',
  'specificity',
  'completeness',
  'structure',
  'effectiveness',
] as const;

const WEIGHTED_SCORE_KEYS = [
  { key: 'clarity', weight: SCORING_WEIGHTS.clarity },
  { key: 'specificity', weight: SCORING_WEIGHTS.specificity },
  { key: 'completeness', weight: SCORING_WEIGHTS.completeness },
  { key: 'structure', weight: SCORING_WEIGHTS.structure },
  { key: 'effectiveness', weight: SCORING_WEIGHTS.effectiveness },
] as const;

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function normalizeScore(score: OptimizeScore): {
  score: OptimizeScore;
  adjusted: boolean;
} {
  const normalizedScore = SCORE_KEYS.reduce((acc, key) => {
    acc[key] = clampScore(score[key]);
    return acc;
  }, {} as OptimizeScore);

  const overall = clampScore(
    WEIGHTED_SCORE_KEYS.reduce(
      (total, item) => total + normalizedScore[item.key] * item.weight,
      0
    )
  );

  const adjusted = overall !== score.overall;
  return {
    score: { ...normalizedScore, overall },
    adjusted,
  };
}

export function mergeCharacteristics(
  prompt: string,
  base: AnalysisCharacteristics
): AnalysisCharacteristics {
  const patternCache = buildPatternCache(prompt);
  const derivedFormat = detectTargetFormat(prompt, patternCache).format;
  const trimmed = prompt.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;

  return {
    ...base,
    detectedFormat: derivedFormat,
    wordCount,
    hasRoleContext: patternCache.hasRole,
    hasExamples: patternCache.hasExamples,
    hasStructure:
      patternCache.hasXmlStructure ||
      patternCache.hasMarkdownStructure ||
      patternCache.hasJsonStructure,
    hasStepByStep: patternCache.hasStepByStep,
    isVague: base.isVague || patternCache.isVague,
  };
}
