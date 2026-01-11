import { z } from 'zod';

import packageJson from '../package.json' with { type: 'json' };

// Hardcoded defaults (not user-configurable)
export const LLM_TIMEOUT_MS = 15000;
export const MAX_PROMPT_LENGTH = 10000;
export const RETRY_MAX_ATTEMPTS = 3;
export const RETRY_BASE_DELAY_MS = 1000;
export const RETRY_MAX_DELAY_MS = 10000;
export const RETRY_TOTAL_TIMEOUT_MS = 180000;

const booleanString = z
  .stringbool({ truthy: ['true'], falsy: ['false'] })
  .optional()
  .default(false);

const envSchema = z.object({
  DEBUG: booleanString,

  LLM_PROVIDER: z
    .enum(['openai', 'anthropic', 'google'])
    .optional()
    .default('openai'),
  LLM_MODEL: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
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

export const DEFAULT_MODELS = {
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20241022',
  google: 'gemini-2.0-flash-exp',
} as const;
