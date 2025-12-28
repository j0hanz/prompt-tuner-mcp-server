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

function safeTest(pattern: RegExp, text: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(text);
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
      return { ok: true };
    }
    case 'fewShot': {
      return { ok: true };
    }
    case 'roleBased': {
      const ok = validateRole(text);
      return ok ? { ok } : { ok, reason: 'Role statement not detected' };
    }
    default:
      return { ok: true };
  }
}
