import { z } from 'zod';

import { MAX_PROMPT_LENGTH } from '../config/constants.js';
import { OPTIMIZATION_TECHNIQUES, TARGET_FORMATS } from '../config/types.js';

function addEmptyPromptIssue(ctx: z.RefinementCtx): void {
  ctx.addIssue({
    code: 'too_small',
    origin: 'string',
    minimum: 1,
    inclusive: true,
    message:
      'Prompt is empty or contains only whitespace. Please provide a valid prompt.',
  });
}

function addTooLongIssue(ctx: z.RefinementCtx, trimmed: string): void {
  ctx.addIssue({
    code: 'too_big',
    origin: 'string',
    maximum: MAX_PROMPT_LENGTH,
    inclusive: true,
    message: `Prompt exceeds maximum length after trimming: ${trimmed.length} characters (limit: ${MAX_PROMPT_LENGTH}). Please shorten your prompt.`,
  });
}

function enforcePromptLength(value: string, ctx: z.RefinementCtx): void {
  const trimmed = value.trim();
  if (trimmed.length < 1) {
    addEmptyPromptIssue(ctx);
    return;
  }

  if (trimmed.length > MAX_PROMPT_LENGTH) {
    addTooLongIssue(ctx, trimmed);
  }
}

export function buildPromptSchema(
  description: string
): z.ZodType<string, string> {
  return z
    .string()
    .max(
      MAX_PROMPT_LENGTH * 2,
      `Prompt rejected: raw input exceeds ${MAX_PROMPT_LENGTH * 2} characters (including whitespace). Trim or shorten your prompt.`
    )
    .superRefine(enforcePromptLength)
    .transform((value) => value.trim())
    .describe(description);
}

const basePromptSchema = buildPromptSchema(
  'Prompt text to improve (plain text, Markdown, or XML)'
);
const analyzePromptSchema = buildPromptSchema('Prompt to analyze');
const validatePromptSchema = buildPromptSchema('Prompt to validate');

const techniqueSchema = z
  .enum(OPTIMIZATION_TECHNIQUES)
  .describe(
    'basic | chainOfThought | fewShot | roleBased | structured | comprehensive'
  );

const targetFormatSchema = z
  .enum(TARGET_FORMATS)
  .describe('auto | claude | gpt | json');

export const RefinePromptInputSchema = z.strictObject({
  prompt: basePromptSchema,
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
  prompt: analyzePromptSchema,
});

export const OptimizePromptInputSchema = z.strictObject({
  prompt: basePromptSchema,
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
  prompt: validatePromptSchema,
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
