export { PATTERNS } from './patterns.js';
export { SERVER_INSTRUCTIONS } from './instructions.js';
export { TYPO_PATTERNS } from './typos.js';

export const SCORING_WEIGHTS = {
  clarity: 0.25,
  specificity: 0.25,
  completeness: 0.2,
  structure: 0.15,
  effectiveness: 0.15,
} as const;

export const SERVER_NAME = 'prompttuner-mcp';
export const SERVER_VERSION = '1.0.0';

// Configurable via environment variables
export const MAX_PROMPT_LENGTH = parseInt(
  process.env.MAX_PROMPT_LENGTH ?? '10000',
  10
);
export const MIN_PROMPT_LENGTH = 1;

export const LLM_TIMEOUT_MS = parseInt(
  process.env.LLM_TIMEOUT_MS ?? '60000',
  10
);
export const LLM_MAX_TOKENS = parseInt(
  process.env.LLM_MAX_TOKENS ?? '2000',
  10
);

export const ANALYSIS_MAX_TOKENS = 1500;
export const ANALYSIS_TIMEOUT_MS = 60000;

export const LLM_MAX_RESPONSE_LENGTH = 500_000;
export const LLM_ERROR_PREVIEW_CHARS = 500;
