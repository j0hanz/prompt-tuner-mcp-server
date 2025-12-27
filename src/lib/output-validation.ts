import { PATTERNS } from '../config/constants.js';
import type { OptimizationTechnique, TargetFormat } from '../config/types.js';

const WRAPPED_CODE_BLOCK_RE = /^```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)\s*```$/;

const DISALLOWED_SCAFFOLDING_PATTERNS: RegExp[] = [
  /^#\s*Prompt (Refinement|Optimization|Analysis)\b/im,
  /^##\s*(Changes|Scores|Techniques Applied|Improvements)\b/im,
  /^\s*Changes:\s*$/im,
  /^\s*Scores:\s*$/im,
  /^\s*Techniques Applied:\s*$/im,
  /^\s*Improvements:\s*$/im,
];

const ROLE_STATEMENT_RE = /\bYou are (a|an|the)\b/i;

const COT_TRIGGERS = [
  "let's calculate step by step",
  "let's analyze this systematically",
  "let's trace through the logic carefully",
  "let's break this into phases",
  "let's evaluate each option methodically",
  "let's work through this step by step",
] as const;

function safeTest(pattern: RegExp, text: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countOccurrences(text: string, pattern: RegExp): number {
  pattern.lastIndex = 0;
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

export function normalizePromptText(text: string): {
  normalized: string;
  changed: boolean;
} {
  const trimmed = text.trim();
  let normalized = trimmed;
  let labelStripped = false;

  if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
    const fenceMatch = WRAPPED_CODE_BLOCK_RE.exec(trimmed);
    if (fenceMatch?.[1]?.trim()) {
      normalized = fenceMatch[1].trim();
    }
  }

  const lines = normalized.split(/\r?\n/);
  const firstLine = lines[0];
  if (firstLine && /^(refined|optimized)?\s*prompt\s*:/i.test(firstLine)) {
    lines.shift();
    normalized = lines.join('\n').trim();
    labelStripped = true;
  }

  const trimmedAfterLabel = normalized.trim();
  if (
    labelStripped &&
    trimmedAfterLabel.startsWith('```') &&
    trimmedAfterLabel.endsWith('```')
  ) {
    const fenceMatch = WRAPPED_CODE_BLOCK_RE.exec(trimmedAfterLabel);
    if (fenceMatch?.[1]?.trim()) {
      normalized = fenceMatch[1].trim();
    }
  }

  if (!normalized) {
    normalized = trimmed;
  }

  return { normalized, changed: normalized !== trimmed };
}

export function containsOutputScaffolding(text: string): boolean {
  return DISALLOWED_SCAFFOLDING_PATTERNS.some((pattern) =>
    safeTest(pattern, text)
  );
}

function validateStructured(text: string, targetFormat: TargetFormat): boolean {
  if (targetFormat === 'claude') {
    return (
      safeTest(PATTERNS.xmlStructure, text) ||
      safeTest(PATTERNS.claudePatterns, text)
    );
  }
  if (targetFormat === 'gpt') {
    return safeTest(PATTERNS.markdownStructure, text);
  }
  if (targetFormat === 'json') {
    return safeTest(PATTERNS.jsonStructure, text) || /json/i.test(text);
  }
  return true;
}

function validateRole(text: string): boolean {
  return ROLE_STATEMENT_RE.test(text.slice(0, 200));
}

function validateChainOfThought(text: string): boolean {
  const total = COT_TRIGGERS.reduce((count, trigger) => {
    const parts = trigger
      .split(/\s+/)
      .map((part) => escapeRegExp(part))
      .join('\\s+');
    const pattern = new RegExp(`(?:^|\\s)${parts}(?:[.!?,;:]|\\s|$)`, 'gi');
    return count + countOccurrences(text, pattern);
  }, 0);

  return total === 1;
}

function validateFewShot(text: string): boolean {
  const inputCount = countOccurrences(text, /(^|\n)\s*Input\s*:/gi);
  const outputCount = countOccurrences(text, /(^|\n)\s*Output\s*:/gi);
  const exampleCount =
    countOccurrences(text, /(^|\n)\s*Example\s+\d+/gi) +
    countOccurrences(text, /<example>/gi) +
    countOccurrences(text, /###\s*Example/gi);

  if (Math.min(inputCount, outputCount) >= 2) {
    return true;
  }

  return exampleCount >= 2;
}

export function validateTechniqueOutput(
  text: string,
  technique: OptimizationTechnique,
  targetFormat: TargetFormat
): { ok: boolean; reason?: string } {
  switch (technique) {
    case 'structured': {
      const ok = validateStructured(text, targetFormat);
      return ok ? { ok } : { ok, reason: 'Structured format not detected' };
    }
    case 'chainOfThought': {
      const ok = validateChainOfThought(text);
      return ok
        ? { ok }
        : { ok, reason: 'Missing or multiple reasoning triggers' };
    }
    case 'fewShot': {
      const ok = validateFewShot(text);
      return ok ? { ok } : { ok, reason: 'Few-shot examples missing' };
    }
    case 'roleBased': {
      const ok = validateRole(text);
      return ok ? { ok } : { ok, reason: 'Role statement not detected' };
    }
    default:
      return { ok: true };
  }
}
