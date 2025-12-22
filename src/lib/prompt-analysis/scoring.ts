import { PATTERNS, SCORING_WEIGHTS } from '../../config/constants.js';
import type {
  PromptCharacteristics,
  PromptScore,
  TargetFormat,
} from '../../config/types.js';
import { detectTargetFormat } from './format.js';

export const SCORING_CONFIG = {
  clarity: { base: 70, vaguePenalty: 5 },
  specificity: {
    base: 60,
    exampleBonus: 15,
    roleBonus: 10,
    numberBonus: 5,
    lengthBonus: 10,
    quoteBonus: 5,
    negationBonus: 5,
  },
  completeness: {
    base: 50,
    roleBonus: 15,
    exampleBonus: 15,
    structureBonus: 10,
    outputBonus: 10,
  },
  structure: {
    base: 40,
    hasStructureBonus: 30,
    stepBonus: 15,
    newlineBonus: 10,
    formatBonus: 5,
  },
  effectiveness: {
    base: 50,
    cotBonus: 20,
    exampleBonus: 15,
    clarityBonus: 15,
  },
  thresholds: { low: 60, mid: 70, high: 80 },
  wordCount: { simple: 50, complex: 200, min: 20 },
  promptLengthMin: 100,
};

const WORD_BOUNDARY_RE = /\S+/g;
const QUOTE_CHARS = ['"', "'", '`'] as const;
const NEGATION_RE = /\b(not|no|never|don't|avoid)\b/i;

// Counts words in a string
function countWords(text: string): number {
  const matches = text.match(WORD_BOUNDARY_RE);
  return matches?.length ?? 0;
}

// Counts regex matches in a string
function countRegexMatches(text: string, regex: RegExp): number {
  const matches = text.match(regex);
  return matches?.length ?? 0;
}

function hasQuote(prompt: string): boolean {
  return QUOTE_CHARS.some((quote) => prompt.includes(quote));
}

function hasNegation(prompt: string): boolean {
  return NEGATION_RE.test(prompt);
}

// Estimates prompt complexity based on word count and structure
function estimateComplexity(
  wordCount: number,
  prompt: string
): 'simple' | 'moderate' | 'complex' {
  if (wordCount > SCORING_CONFIG.wordCount.complex || prompt.includes('\n\n')) {
    return 'complex';
  }
  if (wordCount > SCORING_CONFIG.wordCount.simple) {
    return 'moderate';
  }
  return 'simple';
}

// Checks if prompt has XML or Markdown structure
function hasPromptStructure(prompt: string): boolean {
  return (
    PATTERNS.xmlStructure.test(prompt) ||
    PATTERNS.markdownStructure.test(prompt)
  );
}

// Analyzes prompt characteristics for scoring and suggestions
export function analyzePromptCharacteristics(
  prompt: string,
  options?: { detectedFormat?: TargetFormat }
): PromptCharacteristics {
  const wordCount = countWords(prompt);
  const detectedFormat =
    options?.detectedFormat ?? detectTargetFormat(prompt).format;

  return {
    detectedFormat,
    hasExamples: PATTERNS.exampleIndicators.test(prompt),
    hasRoleContext: PATTERNS.roleIndicators.test(prompt),
    hasStructure: hasPromptStructure(prompt),
    hasStepByStep: PATTERNS.stepByStepIndicators.test(prompt),
    wordCount,
    estimatedComplexity: estimateComplexity(wordCount, prompt),
  };
}

type ScoreCalculator = (
  prompt: string,
  characteristics: PromptCharacteristics,
  clarityScore?: number
) => number;

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

function addIf(score: number, condition: boolean, bonus: number): number {
  return condition ? score + bonus : score;
}

// Calculates clarity score based on vague words
const calculateClarity: ScoreCalculator = (prompt) => {
  const vagueCount = countRegexMatches(prompt, PATTERNS.vagueWords);
  const clarity =
    SCORING_CONFIG.clarity.base -
    vagueCount * SCORING_CONFIG.clarity.vaguePenalty;
  return clampScore(clarity);
};

// Calculates specificity score based on details and examples
const calculateSpecificity: ScoreCalculator = (prompt, characteristics) => {
  const config = SCORING_CONFIG.specificity;
  let score = config.base;
  score = addIf(score, characteristics.hasExamples, config.exampleBonus);
  score = addIf(score, characteristics.hasRoleContext, config.roleBonus);
  score = addIf(score, /\d+/.test(prompt), config.numberBonus);
  score = addIf(
    score,
    prompt.length > SCORING_CONFIG.promptLengthMin,
    config.lengthBonus
  );
  score = addIf(score, hasQuote(prompt), config.quoteBonus);
  score = addIf(score, hasNegation(prompt), config.negationBonus);

  return clampScore(score);
};

// Calculates completeness score based on context and requirements
const calculateCompleteness: ScoreCalculator = (prompt, characteristics) => {
  const config = SCORING_CONFIG.completeness;
  let score = config.base;
  score = addIf(score, characteristics.hasRoleContext, config.roleBonus);
  score = addIf(score, characteristics.hasExamples, config.exampleBonus);
  score = addIf(score, characteristics.hasStructure, config.structureBonus);
  score = addIf(
    score,
    prompt.toLowerCase().includes('output'),
    config.outputBonus
  );

  return clampScore(score);
};

// Calculates structure score based on formatting and organization
const calculateStructure: ScoreCalculator = (prompt, characteristics) => {
  const config = SCORING_CONFIG.structure;
  let score = config.base;
  score = addIf(score, characteristics.hasStructure, config.hasStructureBonus);
  score = addIf(score, characteristics.hasStepByStep, config.stepBonus);
  score = addIf(score, prompt.includes('\n'), config.newlineBonus);
  score = addIf(score, characteristics.hasStructure, config.formatBonus);

  return clampScore(score);
};

// Calculates effectiveness score based on reasoning and clarity
const calculateEffectiveness: ScoreCalculator = (
  _prompt,
  characteristics,
  clarityScore = 0
) => {
  const config = SCORING_CONFIG.effectiveness;
  let score = config.base;
  score = addIf(
    score,
    characteristics.estimatedComplexity !== 'simple' &&
      characteristics.hasStepByStep,
    config.cotBonus
  );
  score = addIf(score, characteristics.hasExamples, config.exampleBonus);
  score = addIf(
    score,
    clarityScore >= SCORING_CONFIG.thresholds.mid,
    config.clarityBonus
  );

  return clampScore(score);
};

// Calculates overall prompt score across all dimensions
export function calculatePromptScore(
  prompt: string,
  characteristics: PromptCharacteristics
): PromptScore {
  const clarity = calculateClarity(prompt, characteristics);
  const specificity = calculateSpecificity(prompt, characteristics);
  const completeness = calculateCompleteness(prompt, characteristics);
  const structure = calculateStructure(prompt, characteristics);
  const effectiveness = calculateEffectiveness(
    prompt,
    characteristics,
    clarity
  );

  const overall = Math.round(
    clarity * SCORING_WEIGHTS.clarity +
      specificity * SCORING_WEIGHTS.specificity +
      completeness * SCORING_WEIGHTS.completeness +
      structure * SCORING_WEIGHTS.structure +
      effectiveness * SCORING_WEIGHTS.effectiveness
  );

  return {
    clarity: Math.round(clarity),
    specificity: Math.round(specificity),
    completeness: Math.round(completeness),
    structure: Math.round(structure),
    effectiveness: Math.round(effectiveness),
    overall,
  };
}
