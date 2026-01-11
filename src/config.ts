import { z } from 'zod';

import packageJson from '../package.json' with { type: 'json' };

const booleanString = z
  .stringbool({ truthy: ['true'], falsy: ['false'] })
  .optional()
  .default(false);

function createNumberString(def: number, min: number): z.ZodType<number> {
  return z
    .string()
    .optional()
    .default(String(def))
    .refine((value) => /^\d+$/.test(value), {
      message: 'Must be an integer (digits only)',
    })
    .transform((value) => parseInt(value, 10))
    .refine((n) => n >= min, { message: `Must be >= ${min}` });
}

const numberString = (def: number, min = 0): z.ZodType<number> =>
  createNumberString(def, min);

const envSchema = z.object({
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
Polish and refine a prompt for better clarity, readability, and flow.

**Input:**
\`\`\`json
{ "prompt": "..." }
\`\`\`

### boost_prompt
Transform a prompt using prompt engineering best practices for maximum clarity and effectiveness.

**Input:**
\`\`\`json
{ "prompt": "..." }
\`\`\`

### crafting_prompt
Generate a structured, reusable workflow prompt for complex tasks based on a raw request and a few settings.

**Input:**
\`\`\`json
{
  "request": "...",
  "objective": "...",
  "constraints": "...",
  "mode": "general|plan|review|troubleshoot",
  "approach": "conservative|balanced|creative",
  "tone": "direct|neutral|friendly",
  "verbosity": "brief|normal|detailed"
}
\`\`\`
`;

const { MAX_PROMPT_LENGTH, LLM_MAX_TOKENS } = config;

export { MAX_PROMPT_LENGTH, LLM_MAX_TOKENS };

export const DEFAULT_MODELS = {
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20241022',
  google: 'gemini-2.0-flash-exp',
} as const;
