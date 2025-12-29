import type { ValidationModel } from './types.js';

export const TOKEN_LIMITS_BY_MODEL: Record<ValidationModel, number> = {
  claude: 200000,
  gpt: 128000,
  gemini: 1000000,
  generic: 8000,
} as const;

const VALIDATION_MODEL_ORDER = [
  'claude',
  'gpt',
  'gemini',
  'generic',
] as const satisfies readonly ValidationModel[];

export const MODEL_LIMITS_LINE = VALIDATION_MODEL_ORDER.map(
  (model) => `${model} ${TOKEN_LIMITS_BY_MODEL[model]}`
).join(' | ');
