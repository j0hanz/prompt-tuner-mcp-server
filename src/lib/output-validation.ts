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

function countOccurrencesUpTo(
  text: string,
  pattern: RegExp,
  maxCount: number
): number {
  if (!pattern.global) {
    return pattern.test(text) ? 1 : 0;
  }

  pattern.lastIndex = 0;
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    count += 1;
    if (count >= maxCount) return count;
    if (match[0] === '') {
      pattern.lastIndex += 1;
    }
  }
  return count;
}

const COT_TRIGGER_PARTS = COT_TRIGGERS.map((trigger) =>
  trigger
    .split(/\s+/)
    .map((part) => escapeRegExp(part))
    .join('\\s+')
);

const COT_TRIGGER_RE = new RegExp(
  `(?:^|\\s)(?:${COT_TRIGGER_PARTS.join('|')})(?:[.!?,;:]|\\s|$)`,
  'gi'
);

const FEW_SHOT_MARKER_RE =
  /(^|\n)\s*(Input\s*:|Output\s*:|Example\s+\d+)|###\s*Example|<example>/gi;

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

  const newlineIndex = normalized.indexOf('\n');
  const firstLine =
    newlineIndex === -1 ? normalized : normalized.slice(0, newlineIndex);
  if (firstLine && /^(refined|optimized)?\s*prompt\s*:/i.test(firstLine)) {
    normalized =
      newlineIndex === -1 ? '' : normalized.slice(newlineIndex + 1).trim();
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
  return countOccurrencesUpTo(text, COT_TRIGGER_RE, 2) === 1;
}

function validateFewShot(text: string): boolean {
  let inputCount = 0;
  let outputCount = 0;
  let exampleCount = 0;

  FEW_SHOT_MARKER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FEW_SHOT_MARKER_RE.exec(text)) !== null) {
    const marker = match[2];
    if (marker) {
      const normalizedMarker = marker.toLowerCase();
      if (normalizedMarker.startsWith('input')) {
        inputCount += 1;
      } else if (normalizedMarker.startsWith('output')) {
        outputCount += 1;
      } else {
        exampleCount += 1;
      }
    } else {
      exampleCount += 1;
    }

    if (Math.min(inputCount, outputCount) >= 2 || exampleCount >= 2) {
      return true;
    }

    if (match[0] === '') {
      FEW_SHOT_MARKER_RE.lastIndex += 1;
    }
  }

  return Math.min(inputCount, outputCount) >= 2 || exampleCount >= 2;
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
