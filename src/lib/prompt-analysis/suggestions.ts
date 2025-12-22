import { PATTERNS } from '../../config/constants.js';
import type {
  PromptCharacteristics,
  PromptScore,
  SuggestionContext,
  SuggestionGenerator,
} from '../../config/types.js';
import { SCORING_CONFIG } from './scoring.js';

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

const EXCELLENT_PROMPT_SUGGESTION =
  'Prompt is excellent! No significant improvements needed. Consider testing with edge cases to verify robustness.';

const SUMMARY_SUGGESTIONS: {
  when: (score: PromptScore) => boolean;
  message: string;
}[] = [
  {
    when: (score) => score.overall >= SCORING_CONFIG.thresholds.high,
    message:
      'Prompt is well-structured! Consider testing with edge cases to verify robustness.',
  },
  {
    when: (score) => score.overall >= SCORING_CONFIG.thresholds.low,
    message: `Prompt has good foundations. Focus on the suggestions above to reach ${SCORING_CONFIG.thresholds.high}+ score.`,
  },
];

function collectSuggestions(context: SuggestionContext): string[] {
  return SUGGESTION_GENERATORS.map((generator) => generator(context)).filter(
    (suggestion): suggestion is string => Boolean(suggestion)
  );
}

function selectSummarySuggestion(score: PromptScore): string | null {
  for (const summary of SUMMARY_SUGGESTIONS) {
    if (summary.when(score)) {
      return summary.message;
    }
  }
  return null;
}

// Generates actionable improvement suggestions based on analysis
export function generateSuggestions(
  prompt: string,
  characteristics: PromptCharacteristics,
  score: PromptScore
): string[] {
  if (score.overall >= 90) {
    return [EXCELLENT_PROMPT_SUGGESTION];
  }

  const context: SuggestionContext = { prompt, characteristics, score };
  const suggestions = collectSuggestions(context);
  const summary = selectSummarySuggestion(score);
  if (summary) {
    suggestions.push(summary);
  }

  return suggestions;
}
