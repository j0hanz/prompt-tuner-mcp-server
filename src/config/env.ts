import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .optional()
  .default('false')
  .transform((v) => v === 'true');

const numberString = (
  def: number,
  min = 0
): z.ZodType<number, z.ZodTypeDef, string | undefined> =>
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
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((v) => v === 'true'),

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
