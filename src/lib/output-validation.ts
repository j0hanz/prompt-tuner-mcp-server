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
const PROMPT_LABEL_RE = /^(refined|optimized)?\s*prompt\s*:/i;

function safeTest(pattern: RegExp, text: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function isWrappedCodeFence(text: string): boolean {
  return text.startsWith('```') && text.endsWith('```');
}

function extractFenceContent(text: string): string | null {
  const fenceMatch = WRAPPED_CODE_BLOCK_RE.exec(text);
  const content = fenceMatch?.[1]?.trim();
  if (!content) return null;
  return content;
}

function stripCodeFence(text: string): string {
  if (!isWrappedCodeFence(text)) return text;
  const content = extractFenceContent(text);
  return content ?? text;
}

function splitFirstLine(text: string): {
  firstLine: string;
  remainder: string;
} {
  const newlineIndex = text.indexOf('\n');
  if (newlineIndex === -1) {
    return { firstLine: text, remainder: '' };
  }
  return {
    firstLine: text.slice(0, newlineIndex),
    remainder: text.slice(newlineIndex + 1),
  };
}

function stripPromptLabel(text: string): { text: string; stripped: boolean } {
  const { firstLine, remainder } = splitFirstLine(text);
  if (!firstLine || !PROMPT_LABEL_RE.test(firstLine)) {
    return { text, stripped: false };
  }
  return { text: remainder.trim(), stripped: true };
}

export function normalizePromptText(text: string): {
  normalized: string;
  changed: boolean;
} {
  const trimmed = text.trim();
  let normalized = stripCodeFence(trimmed);

  const labelResult = stripPromptLabel(normalized);
  normalized = labelResult.text;
  if (labelResult.stripped) {
    normalized = stripCodeFence(normalized);
  }

  const finalText = normalized || trimmed;
  return { normalized: finalText, changed: finalText !== trimmed };
}

export function containsOutputScaffolding(text: string): boolean {
  return DISALLOWED_SCAFFOLDING_PATTERNS.some((pattern) =>
    safeTest(pattern, text)
  );
}

const STRUCTURE_VALIDATORS: Record<TargetFormat, (text: string) => boolean> = {
  claude: (text) =>
    safeTest(PATTERNS.xmlStructure, text) ||
    safeTest(PATTERNS.claudePatterns, text),
  gpt: (text) => safeTest(PATTERNS.markdownStructure, text),
  json: (text) => safeTest(PATTERNS.jsonStructure, text) || /json/i.test(text),
  auto: () => true,
};

function validateStructured(text: string, targetFormat: TargetFormat): boolean {
  return STRUCTURE_VALIDATORS[targetFormat](text);
}

function validateRole(text: string): boolean {
  return ROLE_STATEMENT_RE.test(text.slice(0, 200));
}

function okResult(): { ok: true } {
  return { ok: true };
}

function failResult(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

const TECHNIQUE_VALIDATORS: Record<
  OptimizationTechnique,
  (text: string, targetFormat: TargetFormat) => { ok: boolean; reason?: string }
> = {
  structured: (text, targetFormat) =>
    validateStructured(text, targetFormat)
      ? okResult()
      : failResult('Structured format not detected'),
  roleBased: (text) =>
    validateRole(text) ? okResult() : failResult('Role statement not detected'),
  chainOfThought: () => okResult(),
  fewShot: () => okResult(),
  basic: () => okResult(),
  comprehensive: () => okResult(),
};

export function validateTechniqueOutput(
  text: string,
  technique: OptimizationTechnique,
  targetFormat: TargetFormat
): { ok: boolean; reason?: string } {
  return TECHNIQUE_VALIDATORS[technique](text, targetFormat);
}
