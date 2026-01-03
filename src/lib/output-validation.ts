import { PATTERNS } from '../config/constants.js';
import type { OptimizationTechnique, TargetFormat } from '../config/types.js';

const WRAPPED_CODE_BLOCK_RE = /^```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)\s*```$/;
const ROLE_STATEMENT_RE = /\bYou are (a|an|the)\b/i;
const PROMPT_LABEL_RE = /^(refined|optimized)?\s*prompt\s*:/i;

const DISALLOWED_SCAFFOLDING_PATTERNS: RegExp[] = [
  /^#\s*Prompt (Refinement|Optimization|Analysis)\b/im,
  /^##\s*(Changes|Scores|Techniques Applied|Improvements)\b/im,
  /^\s*Changes:\s*$/im,
  /^\s*Scores:\s*$/im,
  /^\s*Techniques Applied:\s*$/im,
  /^\s*Improvements:\s*$/im,
];

function safeTest(pattern: RegExp, text: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function stripCodeFence(text: string): string {
  if (!text.startsWith('```')) return text;
  const match = WRAPPED_CODE_BLOCK_RE.exec(text);
  return match?.[1]?.trim() ?? text;
}

function stripPromptLabel(text: string): string {
  const [firstLine, ...rest] = text.split('\n');
  if (!firstLine || !PROMPT_LABEL_RE.test(firstLine)) return text;
  return rest.join('\n').trim();
}

export function normalizePromptText(text: string): string {
  const trimmed = text.trim();
  let normalized = stripCodeFence(trimmed);
  normalized = stripPromptLabel(normalized);
  normalized = stripCodeFence(normalized);
  return normalized || trimmed;
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

const TECHNIQUE_VALIDATORS: Record<
  OptimizationTechnique,
  (text: string, targetFormat: TargetFormat) => { ok: boolean; reason?: string }
> = {
  structured: (text, targetFormat) =>
    STRUCTURE_VALIDATORS[targetFormat](text)
      ? { ok: true }
      : { ok: false, reason: 'Structured format not detected' },
  roleBased: (text) =>
    ROLE_STATEMENT_RE.test(text.slice(0, 200))
      ? { ok: true }
      : { ok: false, reason: 'Role statement not detected' },
  chainOfThought: () => ({ ok: true }),
  fewShot: () => ({ ok: true }),
  basic: () => ({ ok: true }),
  comprehensive: () => ({ ok: true }),
};

export function validateTechniqueOutput(
  text: string,
  technique: OptimizationTechnique,
  targetFormat: TargetFormat
): { ok: boolean; reason?: string } {
  return TECHNIQUE_VALIDATORS[technique](text, targetFormat);
}
