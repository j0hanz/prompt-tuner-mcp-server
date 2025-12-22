import { PATTERNS } from '../../config/constants.js';
import type {
  FormatResult,
  FormatScoringConfig,
  PatternCache,
  TargetFormat,
} from '../../config/types.js';

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

function buildAutoResult(recommendation: string): {
  format: TargetFormat;
  confidence: number;
  recommendation: string;
} {
  return { format: 'auto', confidence: 30, recommendation };
}

function scoreFormats(cache: PatternCache): FormatResult[] {
  return (['claude', 'gpt', 'json'] as const).map((format) => {
    const rawScore = calculateFormatScore(cache, FORMAT_SCORING_CONFIG[format]);
    return {
      net: rawScore,
      format,
      recommendation: FORMAT_RECOMMENDATIONS[format],
      rawScore,
    };
  });
}

function getWinner(
  results: FormatResult[],
  maxNet: number
): FormatResult | null {
  return results.find((result) => result.net === maxNet) ?? null;
}

function calculateConfidence(
  results: FormatResult[],
  winner: FormatResult
): number {
  const conflictCount = results.filter((r) => r.rawScore > 0).length;
  const conflictPenalty = conflictCount > 1 ? 15 : 0;
  return Math.min(100, Math.max(20, winner.rawScore + 20 - conflictPenalty));
}

// Detects target format and confidence level
export function detectTargetFormat(prompt: string): {
  format: TargetFormat;
  confidence: number;
  recommendation: string;
} {
  const cache = cachePatterns(prompt);
  const results = scoreFormats(cache);
  const maxNet = Math.max(...results.map((r) => r.net));

  if (maxNet <= 0) {
    return buildAutoResult(
      'No specific format detected. Consider using Claude XML or GPT Markdown based on your target model.'
    );
  }

  const winner = getWinner(results, maxNet);
  if (!winner) {
    return buildAutoResult('Unable to determine format with confidence.');
  }

  return {
    format: winner.format,
    confidence: calculateConfidence(results, winner),
    recommendation: winner.recommendation,
  };
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
