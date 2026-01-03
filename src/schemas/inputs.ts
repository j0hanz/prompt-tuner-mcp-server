import { z } from 'zod';

import { MAX_PROMPT_LENGTH } from '../config/constants.js';
import { OPTIMIZATION_TECHNIQUES, TARGET_FORMATS } from '../config/types.js';

const promptSchema = z
  .string()
  .max(
    MAX_PROMPT_LENGTH * 2,
    `Prompt rejected: raw input exceeds ${MAX_PROMPT_LENGTH * 2} characters (including whitespace). Trim or shorten your prompt.`
  )
  .superRefine((value, ctx) => {
    const trimmed = value.trim();
    if (trimmed.length < 1) {
      ctx.addIssue({
        code: 'too_small',
        origin: 'string',
        minimum: 1,
        inclusive: true,
        message:
          'Prompt is empty or contains only whitespace. Please provide a valid prompt.',
      });
      return;
    }

    if (trimmed.length > MAX_PROMPT_LENGTH) {
      ctx.addIssue({
        code: 'too_big',
        origin: 'string',
        maximum: MAX_PROMPT_LENGTH,
        inclusive: true,
        message: `Prompt exceeds maximum length after trimming: ${trimmed.length} characters (limit: ${MAX_PROMPT_LENGTH}). Please shorten your prompt.`,
      });
    }
  })
  .transform((value) => value.trim())
  .describe('Prompt text to improve (plain text, Markdown, or XML)');

const techniqueSchema = z
  .enum(OPTIMIZATION_TECHNIQUES)
  .describe(
    'basic | chainOfThought | fewShot | roleBased | structured | comprehensive'
  );

const targetFormatSchema = z
  .enum(TARGET_FORMATS)
  .describe('auto | claude | gpt | json');

export const RefinePromptInputSchema = z.strictObject({
  prompt: promptSchema,
  technique: techniqueSchema
    .optional()
    .default('basic')
    .describe(
      'basic | chainOfThought | fewShot | roleBased | structured | comprehensive'
    ),
  targetFormat: targetFormatSchema
    .optional()
    .default('auto')
    .describe('auto | claude | gpt | json'),
});

export const AnalyzePromptInputSchema = z.strictObject({
  prompt: promptSchema,
});

export const OptimizePromptInputSchema = z.strictObject({
  prompt: promptSchema,
  techniques: z
    .array(techniqueSchema)
    .min(1, 'At least one technique required')
    .max(6, 'Maximum 6 techniques allowed')
    .default(['basic'])
    .describe(
      'Array of: basic, chainOfThought, fewShot, roleBased, structured, comprehensive'
    ),
  targetFormat: targetFormatSchema
    .optional()
    .default('auto')
    .describe('auto | claude | gpt | json'),
});

export const ValidatePromptInputSchema = z.strictObject({
  prompt: promptSchema.describe('Prompt to validate'),
  targetModel: z
    .enum(['claude', 'gpt', 'gemini', 'generic'])
    .optional()
    .default('generic')
    .describe('Target AI model for token limit validation'),
  checkInjection: z
    .boolean()
    .optional()
    .default(true)
    .describe('Check for prompt injection patterns'),
});
