import type {
  ValidationIssue,
  ValidationResponse,
} from '../../config/types.js';
import {
  asBulletList,
  buildOutput,
  formatProviderLine,
} from '../../lib/tool-formatters.js';
import type { ValidationModel } from './types.js';

interface OutputSection {
  title: string;
  lines: string[];
}

function formatIssueLine(issue: ValidationIssue): string {
  if (!issue.suggestion) return issue.message;
  return `${issue.message} | Suggestion: ${issue.suggestion}`;
}

function buildSummaryLines(
  parsed: ValidationResponse,
  targetModel: ValidationModel,
  tokenLimit: number
): string[] {
  const overLimit = parsed.tokenEstimate > tokenLimit;
  const utilization = Math.round((parsed.tokenEstimate / tokenLimit) * 100);
  return [
    `Status: ${parsed.isValid ? 'Valid' : 'Invalid'}`,
    `Target model: ${targetModel}`,
    `Token estimate: ~${parsed.tokenEstimate} (limit ${tokenLimit})`,
    `Token utilization: ${utilization}%`,
    `Over limit: ${overLimit ? 'Yes' : 'No'}`,
  ];
}

function buildIssueSections(parsed: ValidationResponse): OutputSection[] {
  const groups: { label: string; type: ValidationIssue['type'] }[] = [
    { label: 'Errors', type: 'error' },
    { label: 'Warnings', type: 'warning' },
    { label: 'Info', type: 'info' },
  ];

  return groups.flatMap((group) => {
    const items = parsed.issues.filter((issue) => issue.type === group.type);
    if (!items.length) return [];
    return [
      {
        title: `${group.label} (${items.length})`,
        lines: asBulletList(items.map(formatIssueLine)),
      },
    ];
  });
}

export function formatValidationOutput(
  parsed: ValidationResponse,
  targetModel: ValidationModel,
  tokenLimit: number,
  provider: { provider: string; model: string }
): string {
  const sections: OutputSection[] = [
    {
      title: 'Summary',
      lines: asBulletList(buildSummaryLines(parsed, targetModel, tokenLimit)),
    },
    ...buildIssueSections(parsed),
  ];

  return buildOutput(
    'Prompt Validation',
    [formatProviderLine(provider)],
    sections,
    [parsed.isValid ? 'Prompt is ready to use.' : 'Fix errors before use.']
  );
}
