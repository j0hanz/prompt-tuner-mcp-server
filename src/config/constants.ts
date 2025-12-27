import packageJson from '../../package.json' with { type: 'json' };
import { config } from './env.js';

export { PATTERNS } from './patterns.js';
export { SERVER_INSTRUCTIONS } from './instructions.js';

export const SCORING_WEIGHTS = {
  clarity: 0.25,
  specificity: 0.25,
  completeness: 0.2,
  structure: 0.15,
  effectiveness: 0.15,
} as const;

export const SERVER_NAME = 'prompttuner-mcp';
export const SERVER_VERSION = packageJson.version;

// Configurable via environment variables
const {
  MAX_PROMPT_LENGTH: ENV_MAX_PROMPT_LENGTH,
  LLM_TIMEOUT_MS: ENV_LLM_TIMEOUT_MS,
  LLM_MAX_TOKENS: ENV_LLM_MAX_TOKENS,
} = config;

export const MAX_PROMPT_LENGTH = ENV_MAX_PROMPT_LENGTH;
export const MIN_PROMPT_LENGTH = 1;

export const LLM_TIMEOUT_MS = ENV_LLM_TIMEOUT_MS;
export const LLM_MAX_TOKENS = ENV_LLM_MAX_TOKENS;

export const ANALYSIS_MAX_TOKENS = Math.min(LLM_MAX_TOKENS, 4000);
export const REFINE_MAX_TOKENS = Math.min(LLM_MAX_TOKENS, 2000);
export const OPTIMIZE_MAX_TOKENS = Math.min(LLM_MAX_TOKENS, 3000);
export const VALIDATE_MAX_TOKENS = Math.min(LLM_MAX_TOKENS, 1000);

export const LLM_MAX_RESPONSE_LENGTH = 500_000;
export const LLM_ERROR_PREVIEW_CHARS = 500;

export const DEFAULT_MODELS = {
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20241022',
  google: 'gemini-2.0-flash-exp',
} as const;
