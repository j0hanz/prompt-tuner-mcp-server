import { SCORING_WEIGHTS } from '../config/constants.js';
import type {
  AnalysisCharacteristics,
  OptimizeScore,
} from '../config/types.js';
import {
  buildPatternCache,
  detectTargetFormat,
} from './prompt-analysis/format.js';

const WHITESPACE_RE = /\s/;

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function countWords(text: string): number {
  let count = 0;
  let inWord = false;

  for (const char of text) {
    if (WHITESPACE_RE.test(char)) {
      inWord = false;
    } else if (!inWord) {
      count += 1;
      inWord = true;
    }
  }

  return count;
}

export function normalizeScore(score: OptimizeScore): {
  score: OptimizeScore;
  adjusted: boolean;
} {
  const normalizedScore = {
    clarity: clampScore(score.clarity),
    specificity: clampScore(score.specificity),
    completeness: clampScore(score.completeness),
    structure: clampScore(score.structure),
    effectiveness: clampScore(score.effectiveness),
  } satisfies Omit<OptimizeScore, 'overall'>;

  const overall = clampScore(
    normalizedScore.clarity * SCORING_WEIGHTS.clarity +
      normalizedScore.specificity * SCORING_WEIGHTS.specificity +
      normalizedScore.completeness * SCORING_WEIGHTS.completeness +
      normalizedScore.structure * SCORING_WEIGHTS.structure +
      normalizedScore.effectiveness * SCORING_WEIGHTS.effectiveness
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
  const wordCount = trimmed ? countWords(trimmed) : 0;

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
