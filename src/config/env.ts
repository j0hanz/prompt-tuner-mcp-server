import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .optional()
  .default('false')
  .transform((v) => v === 'true');

const numberString = (
  def: number
): z.ZodType<number, z.ZodTypeDef, string | undefined> =>
  z
    .string()
    .optional()
    .default(String(def))
    .transform((v) => parseInt(v, 10));

const envSchema = z.object({
  // Server
  LOG_FORMAT: z.enum(['json', 'text']).optional().default('text'),
  DEBUG: booleanString,
  INCLUDE_ERROR_CONTEXT: booleanString,

  // LLM
  LLM_PROVIDER: z
    .enum(['openai', 'anthropic', 'google'])
    .optional()
    .default('openai'),
  LLM_MODEL: z.string().optional(),
  LLM_TIMEOUT_MS: numberString(60000),
  LLM_MAX_TOKENS: numberString(2000),
  GOOGLE_SAFETY_DISABLED: booleanString,

  // Keys
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),

  // Constraints
  MAX_PROMPT_LENGTH: numberString(10000),

  // Cache
  CACHE_MAX_SIZE: numberString(1000),

  // Retry
  RETRY_MAX_ATTEMPTS: numberString(3),
  RETRY_BASE_DELAY_MS: numberString(1000),
  RETRY_MAX_DELAY_MS: numberString(10000),
  RETRY_TOTAL_TIMEOUT_MS: numberString(180000),
});

export const config = envSchema.parse(process.env);
