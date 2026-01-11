import type { AnalysisResponse, ProviderInfo } from '../../config/types.js';
import {
  asBulletList,
  asNumberedList,
  buildOutput,
  formatProviderLine,
} from '../../lib/tool-formatters.js';

function formatScoreLines(score: AnalysisResponse['score']): string[] {
  return asBulletList([
    `Clarity: ${score.clarity}/100`,
    `Specificity: ${score.specificity}/100`,
    `Completeness: ${score.completeness}/100`,
    `Structure: ${score.structure}/100`,
    `Effectiveness: ${score.effectiveness}/100`,
    `Overall: ${score.overall}/100`,
  ]);
}

function formatYesNo(label: string, value: boolean): string {
  return `${label}: ${value ? 'Yes' : 'No'}`;
}

function formatCharacteristicLines(
  characteristics: AnalysisResponse['characteristics']
): string[] {
  return asBulletList([
    formatYesNo('Typos detected', characteristics.hasTypos),
    formatYesNo('Vague language', characteristics.isVague),
    formatYesNo('Missing context', characteristics.missingContext),
    formatYesNo('Role defined', characteristics.hasRoleContext),
    formatYesNo('Examples present', characteristics.hasExamples),
    formatYesNo('Structured sections', characteristics.hasStructure),
    formatYesNo('Step-by-step guidance', characteristics.hasStepByStep),
    `Detected format: ${characteristics.detectedFormat}`,
    `Complexity: ${characteristics.estimatedComplexity}`,
    `Word count: ${characteristics.wordCount}`,
  ]);
}

export function formatAnalysisOutput(
  analysisResult: AnalysisResponse,
  provider: ProviderInfo
): string {
  return buildOutput(
    'Prompt Analysis',
    [formatProviderLine(provider)],
    [
      { title: 'Scores', lines: formatScoreLines(analysisResult.score) },
      {
        title: 'Characteristics',
        lines: formatCharacteristicLines(analysisResult.characteristics),
      },
      {
        title: 'Suggestions',
        lines: asNumberedList(analysisResult.suggestions),
      },
    ]
  );
}
