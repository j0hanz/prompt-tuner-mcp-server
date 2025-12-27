import { PATTERNS, SCORING_WEIGHTS } from '../config/constants.js';
import type {
  AnalysisCharacteristics,
  OptimizeScore,
} from '../config/types.js';
import { detectTargetFormat } from './prompt-analysis.js';

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

function safeTest(pattern: RegExp, text: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  let count = 0;
  const pattern = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(trimmed)) !== null) {
    count += 1;
    if (match[0] === '') {
      pattern.lastIndex += 1;
    }
  }
  return count;
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
  const derivedFormat = detectTargetFormat(prompt).format;
  const derivedWordCount = countWords(prompt);
  const derivedHasRole = safeTest(PATTERNS.hasRole, prompt);
  const derivedHasExamples =
    safeTest(PATTERNS.exampleIndicators, prompt) ||
    safeTest(PATTERNS.fewShotStructure, prompt);
  const derivedHasStructure =
    safeTest(PATTERNS.xmlStructure, prompt) ||
    safeTest(PATTERNS.markdownStructure, prompt) ||
    safeTest(PATTERNS.jsonStructure, prompt);
  const derivedHasStepByStep = safeTest(PATTERNS.stepByStepIndicators, prompt);
  const derivedIsVague = base.isVague || safeTest(PATTERNS.vagueWords, prompt);

  const characteristics: AnalysisCharacteristics = {
    ...base,
    detectedFormat: derivedFormat,
    wordCount: derivedWordCount,
    hasRoleContext: derivedHasRole,
    hasExamples: derivedHasExamples,
    hasStructure: derivedHasStructure,
    hasStepByStep: derivedHasStepByStep,
    isVague: derivedIsVague,
  };

  return characteristics;
}
