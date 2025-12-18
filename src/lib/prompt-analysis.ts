import { PATTERNS, SCORING_WEIGHTS } from '../config/constants.js';
import type {
  FormatResult,
  FormatScoringConfig,
  PatternCache,
  PromptCharacteristics,
  PromptScore,
  ScoreRule,
  SuggestionContext,
  SuggestionGenerator,
  TargetFormat,
} from '../config/types.js';

const SCORING_CONFIG = {
  clarity: {
    base: 70,
    vaguePenalty: 5,
  },
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
  thresholds: {
    low: 60,
    mid: 70,
    high: 80,
  },
  wordCount: {
    simple: 50,
    complex: 200,
    min: 20,
  },
  promptLengthMin: 100,
} as const;

const WORD_BOUNDARY_RE = /\S+/g;

function hasPromptStructure(prompt: string): boolean {
  return (
    PATTERNS.xmlStructure.test(prompt) ||
    PATTERNS.markdownStructure.test(prompt)
  );
}

function countWords(text: string): number {
  const matches = text.match(WORD_BOUNDARY_RE);
  return matches?.length ?? 0;
}

function countRegexMatches(text: string, regex: RegExp): number {
  const matches = text.match(regex);
  return matches?.length ?? 0;
}

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

export function analyzePromptCharacteristics(
  prompt: string,
  options?: {
    detectedFormat?: TargetFormat;
  }
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

function calculateClarity(prompt: string): number {
  const vagueCount = countRegexMatches(prompt, PATTERNS.vagueWords);
  const clarity =
    SCORING_CONFIG.clarity.base -
    vagueCount * SCORING_CONFIG.clarity.vaguePenalty;
  return Math.max(0, Math.min(100, clarity));
}

function applyScoreRules(baseScore: number, rules: ScoreRule[]): number {
  const score = rules.reduce(
    (acc, rule) => (rule.condition ? acc + rule.bonus : acc),
    baseScore
  );
  return Math.max(0, Math.min(100, score));
}

function calculateSpecificity(
  prompt: string,
  characteristics: PromptCharacteristics
): number {
  const config = SCORING_CONFIG.specificity;
  const rules: ScoreRule[] = [
    {
      condition: characteristics.hasExamples,
      bonus: config.exampleBonus,
    },
    {
      condition: characteristics.hasRoleContext,
      bonus: config.roleBonus,
    },
    { condition: /\d+/.test(prompt), bonus: config.numberBonus },
    {
      condition: prompt.length > SCORING_CONFIG.promptLengthMin,
      bonus: config.lengthBonus,
    },
    {
      condition:
        prompt.includes('"') || prompt.includes("'") || prompt.includes('`'),
      bonus: config.quoteBonus,
    },
    {
      condition: /\b(not|no|never|don't|avoid)\b/i.test(prompt),
      bonus: config.negationBonus,
    },
  ];
  return applyScoreRules(config.base, rules);
}

function calculateCompleteness(
  prompt: string,
  characteristics: PromptCharacteristics
): number {
  const config = SCORING_CONFIG.completeness;
  const rules: ScoreRule[] = [
    {
      condition: characteristics.hasRoleContext,
      bonus: config.roleBonus,
    },
    {
      condition: characteristics.hasExamples,
      bonus: config.exampleBonus,
    },
    {
      condition: characteristics.hasStructure,
      bonus: config.structureBonus,
    },
    {
      condition: prompt.toLowerCase().includes('output'),
      bonus: config.outputBonus,
    },
  ];
  return applyScoreRules(config.base, rules);
}

function calculateStructure(
  prompt: string,
  characteristics: PromptCharacteristics
): number {
  const config = SCORING_CONFIG.structure;
  const rules: ScoreRule[] = [
    {
      condition: characteristics.hasStructure,
      bonus: config.hasStructureBonus,
    },
    { condition: characteristics.hasStepByStep, bonus: config.stepBonus },
    { condition: prompt.includes('\n'), bonus: config.newlineBonus },
    // Use characteristics.hasStructure instead of duplicate hasPromptStructure() call
    { condition: characteristics.hasStructure, bonus: config.formatBonus },
  ];
  return applyScoreRules(config.base, rules);
}

function calculateEffectiveness(
  characteristics: PromptCharacteristics,
  clarity: number
): number {
  const config = SCORING_CONFIG.effectiveness;
  const rules: ScoreRule[] = [
    {
      condition:
        characteristics.estimatedComplexity !== 'simple' &&
        characteristics.hasStepByStep,
      bonus: config.cotBonus,
    },
    {
      condition: characteristics.hasExamples,
      bonus: config.exampleBonus,
    },
    {
      condition: clarity >= SCORING_CONFIG.thresholds.mid,
      bonus: config.clarityBonus,
    },
  ];
  return applyScoreRules(config.base, rules);
}

export function calculatePromptScore(
  prompt: string,
  characteristics: PromptCharacteristics
): PromptScore {
  const clarity = calculateClarity(prompt);
  const specificity = calculateSpecificity(prompt, characteristics);
  const completeness = calculateCompleteness(prompt, characteristics);
  const structure = calculateStructure(prompt, characteristics);
  const effectiveness = calculateEffectiveness(characteristics, clarity);

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

function getGeneralFeedback(score: PromptScore): string | null {
  if (score.overall >= SCORING_CONFIG.thresholds.high) {
    return 'Prompt is well-structured! Consider testing with edge cases to verify robustness.';
  }
  if (score.overall >= SCORING_CONFIG.thresholds.low) {
    return `Prompt has good foundations. Focus on the suggestions above to reach ${SCORING_CONFIG.thresholds.high}+ score.`;
  }
  return null;
}

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

  const feedback = getGeneralFeedback(score);
  if (feedback) {
    suggestions.push(feedback);
  }

  return suggestions;
}

export function resolveFormat(
  format: TargetFormat,
  prompt: string
): TargetFormat {
  if (format !== 'auto') return format;
  const detected = detectTargetFormat(prompt);
  return detected.format === 'auto' ? 'gpt' : detected.format;
}

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

function scoreIf(condition: boolean, points: number): number {
  return condition ? points : 0;
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

function calculateFormatScore(
  cache: PatternCache,
  config: FormatScoringConfig
): { score: number; negative: number } {
  const score = config.positive.reduce(
    (acc, { key, weight }) => acc + scoreIf(cache[key], weight),
    0
  );
  const negative = config.negative.reduce(
    (acc, { key, weight }) => acc + scoreIf(cache[key], weight),
    0
  );
  return { score, negative };
}

const FORMAT_RECOMMENDATIONS: Record<'claude' | 'gpt' | 'json', string> = {
  claude: 'XML-style formatting detected. Optimal for Claude models.',
  gpt: 'Markdown formatting detected. Optimal for GPT models.',
  json: 'JSON structure detected. Good for structured data extraction.',
};

function getFormatResults(cache: PatternCache): FormatResult[] {
  return (['claude', 'gpt', 'json'] as const).map((format) => {
    const result = calculateFormatScore(cache, FORMAT_SCORING_CONFIG[format]);
    return {
      net: result.score - result.negative,
      format,
      recommendation: FORMAT_RECOMMENDATIONS[format],
      rawScore: result.score,
    };
  });
}

function calculateConfidence(
  winner: FormatResult,
  formatResults: FormatResult[]
): number {
  const conflictCount = formatResults.filter((r) => r.rawScore > 0).length;
  const conflictPenalty = conflictCount > 1 ? 15 : 0;
  return Math.min(100, Math.max(20, winner.rawScore + 20 - conflictPenalty));
}

export function detectTargetFormat(prompt: string): {
  format: TargetFormat;
  confidence: number;
  recommendation: string;
} {
  const cache = cachePatterns(prompt);
  const formatResults = getFormatResults(cache);
  const maxNet = Math.max(...formatResults.map((r) => r.net));

  if (maxNet <= 0) {
    return createAutoFormatResult(
      'No specific format detected. Consider using Claude XML or GPT Markdown based on your target model.'
    );
  }

  const winner = formatResults.find((r) => r.net === maxNet);

  if (!winner) {
    return createAutoFormatResult(
      'Unable to determine format with confidence.'
    );
  }

  const confidence = calculateConfidence(winner, formatResults);

  return {
    format: winner.format,
    confidence,
    recommendation: winner.recommendation,
  };
}

function createAutoFormatResult(recommendation: string): {
  format: TargetFormat;
  confidence: number;
  recommendation: string;
} {
  return {
    format: 'auto',
    confidence: 30,
    recommendation,
  };
}
