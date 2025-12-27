import { z } from 'zod';

import { MAX_PROMPT_LENGTH } from '../config/constants.js';
import { OPTIMIZATION_TECHNIQUES, TARGET_FORMATS } from '../config/types.js';

const promptSchema = z
  .string()
  .superRefine((value, ctx) => {
    if (value.length > MAX_PROMPT_LENGTH * 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: MAX_PROMPT_LENGTH * 2,
        type: 'string',
        inclusive: true,
        message: `Prompt with excessive whitespace rejected (${value.length} characters). Maximum allowed: ${MAX_PROMPT_LENGTH * 2}`,
      });
      return;
    }

    const trimmed = value.trim();
    if (trimmed.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_small,
        minimum: 1,
        type: 'string',
        inclusive: true,
        message:
          'Prompt is empty or contains only whitespace. Please provide a valid prompt.',
      });
      return;
    }

    if (trimmed.length > MAX_PROMPT_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: MAX_PROMPT_LENGTH,
        type: 'string',
        inclusive: true,
        message: `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters (${trimmed.length} provided). Please shorten your prompt.`,
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

export const RefinePromptInputSchema = z.object({
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

export const AnalyzePromptInputSchema = z.object({
  prompt: promptSchema,
});

export const OptimizePromptInputSchema = z.object({
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

export const ValidatePromptInputSchema = z.object({
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
