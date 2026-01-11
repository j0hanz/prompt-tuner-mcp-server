import { z } from 'zod';

import packageJson from '../package.json' with { type: 'json' };

const booleanString = z
  .stringbool({ truthy: ['true'], falsy: ['false'] })
  .optional()
  .default(false);

const numberString = (
  def: number,
  min = 0
): z.ZodType<number, string | undefined> =>
  z
    .string()
    .optional()
    .default(String(def))
    .transform((v) => parseInt(v, 10))
    .refine((n) => n >= min, { message: `Must be >= ${min}` });

const envSchema = z.object({
  LOG_FORMAT: z.enum(['json', 'text']).optional().default('text'),
  DEBUG: booleanString,
  INCLUDE_ERROR_CONTEXT: booleanString,

  LLM_PROVIDER: z
    .enum(['openai', 'anthropic', 'google'])
    .optional()
    .default('openai'),
  LLM_MODEL: z.string().optional(),
  LLM_TIMEOUT_MS: numberString(60000, 1000),
  LLM_MAX_TOKENS: numberString(8000, 1),
  GOOGLE_SAFETY_DISABLED: z
    .stringbool({ truthy: ['true'], falsy: ['false'] })
    .optional()
    .default(false),

  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),

  MAX_PROMPT_LENGTH: numberString(10000, 1),

  RETRY_MAX_ATTEMPTS: numberString(3, 0),
  RETRY_BASE_DELAY_MS: numberString(1000, 100),
  RETRY_MAX_DELAY_MS: numberString(10000, 1000),
  RETRY_TOTAL_TIMEOUT_MS: numberString(180000, 10000),
});

export const config = envSchema.parse(process.env);

export const SERVER_NAME = 'prompttuner-mcp';
export const SERVER_VERSION = packageJson.version;

export const SERVER_INSTRUCTIONS = `# PromptTuner MCP

A lean prompt editing toolkit.

## Tools

### fix_prompt
Fix spelling and grammar only.

**Input:**
\`\`\`json
{ "prompt": "..." }
\`\`\`

### boost_prompt
Improve a prompt to be clearer and more effective.

**Input:**
\`\`\`json
{ "prompt": "..." }
\`\`\`

## Prompts

- \`fix\` - Generates a message asking to fix grammar/spelling.
- \`boost\` - Generates a message asking to improve a prompt.
`;

const {
  MAX_PROMPT_LENGTH: ENV_MAX_PROMPT_LENGTH,
  LLM_TIMEOUT_MS: ENV_LLM_TIMEOUT_MS,
  LLM_MAX_TOKENS: ENV_LLM_MAX_TOKENS,
} = config;

export const MAX_PROMPT_LENGTH = ENV_MAX_PROMPT_LENGTH;
export const MIN_PROMPT_LENGTH = 1;

export const LLM_TIMEOUT_MS = ENV_LLM_TIMEOUT_MS;
export const LLM_MAX_TOKENS = ENV_LLM_MAX_TOKENS;

export const DEFAULT_MODELS = {
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20241022',
  google: 'gemini-2.0-flash-exp',
} as const;
