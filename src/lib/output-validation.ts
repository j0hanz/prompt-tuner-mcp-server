import { PATTERNS } from '../config/constants.js';
import type { OptimizationTechnique, TargetFormat } from '../config/types.js';

const ROLE_STATEMENT_RE = /\bYou are (a|an|the)\b/i;
const PROMPT_LABEL_RE = /^(refined|optimized)?\s*prompt\s*:/i;

const CODE_FENCE = '```';
const CODE_BLOCK_LANG_RE = /^[a-zA-Z0-9_-]+$/;
const SCAFFOLDING_PROMPT_TITLES = new Set([
  'prompt refinement',
  'prompt optimization',
  'prompt analysis',
]);
const SCAFFOLDING_SECTION_TITLES = new Set([
  'changes',
  'scores',
  'techniques applied',
  'improvements',
]);
const SCAFFOLDING_LABELS = new Set([
  'changes:',
  'scores:',
  'techniques applied:',
  'improvements:',
]);

function safeTest(pattern: RegExp, text: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function stripSingleLineLang(value: string): string {
  const firstWhitespace = value.search(/\s/);
  if (firstWhitespace === -1) return value;
  const token = value.slice(0, firstWhitespace);
  if (!CODE_BLOCK_LANG_RE.test(token)) return value;
  return value.slice(firstWhitespace + 1);
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith(CODE_FENCE) || !trimmed.endsWith(CODE_FENCE)) {
    return text;
  }

  const inner = trimmed.slice(CODE_FENCE.length, -CODE_FENCE.length);
  const innerTrimmedStart = inner.trimStart();
  if (!innerTrimmedStart) return '';

  const newlineIndex = innerTrimmedStart.indexOf('\n');
  if (newlineIndex === -1) {
    return stripSingleLineLang(innerTrimmedStart).trim();
  }

  const firstLine = innerTrimmedStart.slice(0, newlineIndex).trim();
  const rest = innerTrimmedStart.slice(newlineIndex + 1);
  if (!firstLine || CODE_BLOCK_LANG_RE.test(firstLine)) {
    return rest.trim();
  }

  return innerTrimmedStart.trim();
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
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const lowered = trimmed.toLowerCase();
    if (isScaffoldingHeading(lowered) || isScaffoldingLabel(lowered)) {
      return true;
    }
  }
  return false;
}

function isScaffoldingHeading(line: string): boolean {
  if (!line.startsWith('#')) return false;
  let index = 0;
  while (line[index] === '#') index += 1;
  const heading = line.slice(index).trim();
  return (
    SCAFFOLDING_PROMPT_TITLES.has(heading) ||
    SCAFFOLDING_SECTION_TITLES.has(heading)
  );
}

function isScaffoldingLabel(line: string): boolean {
  return SCAFFOLDING_LABELS.has(line);
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
