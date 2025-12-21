import { PATTERNS, SCORING_WEIGHTS } from '../config/constants.js';
import type {
  FormatResult,
  FormatScoringConfig,
  PatternCache,
  PromptCharacteristics,
  PromptScore,
  SuggestionContext,
  SuggestionGenerator,
  TargetFormat,
} from '../config/types.js';

const SCORING_CONFIG = {
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
} as const;

const WORD_BOUNDARY_RE = /\S+/g;

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

// Calculates clarity score based on vague words
const calculateClarity: ScoreCalculator = (prompt) => {
  const vagueCount = countRegexMatches(prompt, PATTERNS.vagueWords);
  const clarity =
    SCORING_CONFIG.clarity.base -
    vagueCount * SCORING_CONFIG.clarity.vaguePenalty;
  return Math.max(0, Math.min(100, clarity));
};

// Calculates specificity score based on details and examples
const calculateSpecificity: ScoreCalculator = (prompt, characteristics) => {
  const config = SCORING_CONFIG.specificity;
  let score = config.base;

  if (characteristics.hasExamples) score += config.exampleBonus;
  if (characteristics.hasRoleContext) score += config.roleBonus;
  if (/\d+/.test(prompt)) score += config.numberBonus;
  if (prompt.length > SCORING_CONFIG.promptLengthMin)
    score += config.lengthBonus;
  if (prompt.includes('"') || prompt.includes("'") || prompt.includes('`'))
    score += config.quoteBonus;
  if (/\b(not|no|never|don't|avoid)\b/i.test(prompt))
    score += config.negationBonus;

  return Math.max(0, Math.min(100, score));
};

// Calculates completeness score based on context and requirements
const calculateCompleteness: ScoreCalculator = (prompt, characteristics) => {
  const config = SCORING_CONFIG.completeness;
  let score = config.base;

  if (characteristics.hasRoleContext) score += config.roleBonus;
  if (characteristics.hasExamples) score += config.exampleBonus;
  if (characteristics.hasStructure) score += config.structureBonus;
  if (prompt.toLowerCase().includes('output')) score += config.outputBonus;

  return Math.max(0, Math.min(100, score));
};

// Calculates structure score based on formatting and organization
const calculateStructure: ScoreCalculator = (prompt, characteristics) => {
  const config = SCORING_CONFIG.structure;
  let score = config.base;

  if (characteristics.hasStructure) score += config.hasStructureBonus;
  if (characteristics.hasStepByStep) score += config.stepBonus;
  if (prompt.includes('\n')) score += config.newlineBonus;
  if (characteristics.hasStructure) score += config.formatBonus;

  return Math.max(0, Math.min(100, score));
};

// Calculates effectiveness score based on reasoning and clarity
const calculateEffectiveness: ScoreCalculator = (
  _prompt,
  characteristics,
  clarityScore = 0
) => {
  const config = SCORING_CONFIG.effectiveness;
  let score = config.base;

  if (
    characteristics.estimatedComplexity !== 'simple' &&
    characteristics.hasStepByStep
  ) {
    score += config.cotBonus;
  }
  if (characteristics.hasExamples) score += config.exampleBonus;
  if (clarityScore >= SCORING_CONFIG.thresholds.mid)
    score += config.clarityBonus;

  return Math.max(0, Math.min(100, score));
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

const SUGGESTION_GENERATORS: SuggestionGenerator[] = [
  ({ score }) =>
    score.clarity < SCORING_CONFIG.thresholds.mid
      ? 'Remove vague language ("something", "stuff", "etc.") and replace with specific terms'
      : null,

  ({ characteristics, score }) =>
    !characteristics.hasRoleContext &&
    score.specificity < SCORING_CONFIG.thresholds.mid
      ? 'Add a role/persona to activate domain expertise (e.g., "You are a senior software engineer...")'
      : null,

  ({ characteristics, score }) =>
    !characteristics.hasExamples &&
    score.completeness < SCORING_CONFIG.thresholds.mid
      ? 'Include 1-2 examples showing desired input/output format'
      : null,

  ({ characteristics }) => {
    if (
      !characteristics.hasStructure &&
      characteristics.estimatedComplexity !== 'simple'
    ) {
      return characteristics.detectedFormat === 'claude'
        ? 'Add XML structure with tags like <context>, <task>, <requirements>'
        : 'Add Markdown structure with ## headers for Context, Task, Requirements';
    }
    return null;
  },

  ({ characteristics }) =>
    !characteristics.hasStepByStep &&
    characteristics.estimatedComplexity === 'complex'
      ? 'Add reasoning guidance: "Let\'s think through this step by step"'
      : null,

  ({ characteristics }) =>
    characteristics.wordCount < SCORING_CONFIG.wordCount.min
      ? 'Expand the prompt with more context, constraints, and expected output format'
      : null,

  ({ prompt, score }) =>
    !PATTERNS.outputSpecPatterns.test(prompt) &&
    score.completeness < SCORING_CONFIG.thresholds.high
      ? 'Specify the expected output format (e.g., "Respond with JSON:", "Format as:")'
      : null,

  ({ prompt, characteristics }) =>
    !PATTERNS.constraintPatterns.test(prompt) &&
    characteristics.estimatedComplexity === 'complex'
      ? 'Add explicit constraints using ALWAYS/NEVER patterns to prevent common errors'
      : null,
];

// Generates actionable improvement suggestions based on analysis
export function generateSuggestions(
  prompt: string,
  characteristics: PromptCharacteristics,
  score: PromptScore
): string[] {
  if (score.overall >= 90) {
    return [
      'Prompt is excellent! No significant improvements needed. Consider testing with edge cases to verify robustness.',
    ];
  }

  const context: SuggestionContext = { prompt, characteristics, score };
  const suggestions: string[] = [];

  for (const generator of SUGGESTION_GENERATORS) {
    const suggestion = generator(context);
    if (suggestion) {
      suggestions.push(suggestion);
    }
  }

  if (score.overall >= SCORING_CONFIG.thresholds.high) {
    suggestions.push(
      'Prompt is well-structured! Consider testing with edge cases to verify robustness.'
    );
  } else if (score.overall >= SCORING_CONFIG.thresholds.low) {
    suggestions.push(
      `Prompt has good foundations. Focus on the suggestions above to reach ${SCORING_CONFIG.thresholds.high}+ score.`
    );
  }

  return suggestions;
}

// Resolves target format, defaulting to GPT if auto-detection fails
export function resolveFormat(
  format: TargetFormat,
  prompt: string
): TargetFormat {
  if (format !== 'auto') return format;
  const detected = detectTargetFormat(prompt);
  return detected.format === 'auto' ? 'gpt' : detected.format;
}

// Caches pattern detection results for format scoring
function cachePatterns(prompt: string): PatternCache {
  return {
    hasClaudePatterns: PATTERNS.claudePatterns.test(prompt),
    hasXmlStructure: PATTERNS.xmlStructure.test(prompt),
    hasMarkdownStructure: PATTERNS.markdownStructure.test(prompt),
    hasGptPatterns: PATTERNS.gptPatterns.test(prompt),
    hasJsonStructure: PATTERNS.jsonStructure.test(prompt),
    hasBoldOrHeaders: prompt.includes('**') || prompt.includes('##'),
    hasAngleBrackets: prompt.includes('<') && prompt.includes('>'),
    hasJsonChars: prompt.includes('"') && prompt.includes(':'),
  };
}

const FORMAT_SCORING_CONFIG: Record<
  'claude' | 'gpt' | 'json',
  FormatScoringConfig
> = {
  claude: {
    positive: [
      { key: 'hasClaudePatterns', weight: 40 },
      { key: 'hasXmlStructure', weight: 30 },
      { key: 'hasAngleBrackets', weight: 10 },
    ],
    negative: [
      { key: 'hasMarkdownStructure', weight: 15 },
      { key: 'hasBoldOrHeaders', weight: 10 },
    ],
  },
  gpt: {
    positive: [
      { key: 'hasGptPatterns', weight: 40 },
      { key: 'hasMarkdownStructure', weight: 30 },
      { key: 'hasBoldOrHeaders', weight: 10 },
    ],
    negative: [
      { key: 'hasXmlStructure', weight: 20 },
      { key: 'hasClaudePatterns', weight: 15 },
    ],
  },
  json: {
    positive: [
      { key: 'hasJsonStructure', weight: 50 },
      { key: 'hasJsonChars', weight: 20 },
    ],
    negative: [
      { key: 'hasXmlStructure', weight: 25 },
      { key: 'hasMarkdownStructure', weight: 25 },
    ],
  },
};

const FORMAT_RECOMMENDATIONS: Record<'claude' | 'gpt' | 'json', string> = {
  claude: 'XML-style formatting detected. Optimal for Claude models.',
  gpt: 'Markdown formatting detected. Optimal for GPT models.',
  json: 'JSON structure detected. Good for structured data extraction.',
};

// Calculates format score based on pattern weights
function calculateFormatScore(
  cache: PatternCache,
  config: FormatScoringConfig
): number {
  let score = 0;
  for (const { key, weight } of config.positive) {
    if (cache[key]) score += weight;
  }
  for (const { key, weight } of config.negative) {
    if (cache[key]) score -= weight;
  }
  return score;
}

// Detects target format and confidence level
export function detectTargetFormat(prompt: string): {
  format: TargetFormat;
  confidence: number;
  recommendation: string;
} {
  const cache = cachePatterns(prompt);
  const results: FormatResult[] = (['claude', 'gpt', 'json'] as const).map(
    (format) => {
      const rawScore = calculateFormatScore(
        cache,
        FORMAT_SCORING_CONFIG[format]
      );
      return {
        net: rawScore,
        format,
        recommendation: FORMAT_RECOMMENDATIONS[format],
        rawScore,
      };
    }
  );

  const maxNet = Math.max(...results.map((r) => r.net));

  if (maxNet <= 0) {
    return {
      format: 'auto',
      confidence: 30,
      recommendation:
        'No specific format detected. Consider using Claude XML or GPT Markdown based on your target model.',
    };
  }

  const winner = results.find((r) => r.net === maxNet);

  if (!winner) {
    return {
      format: 'auto',
      confidence: 30,
      recommendation: 'Unable to determine format with confidence.',
    };
  }

  const conflictCount = results.filter((r) => r.rawScore > 0).length;
  const conflictPenalty = conflictCount > 1 ? 15 : 0;
  const confidence = Math.min(
    100,
    Math.max(20, winner.rawScore + 20 - conflictPenalty)
  );

  return {
    format: winner.format,
    confidence,
    recommendation: winner.recommendation,
  };
}
