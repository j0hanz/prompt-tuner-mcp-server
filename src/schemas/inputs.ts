import { z } from 'zod';

import { MAX_PROMPT_LENGTH } from '../config/constants.js';

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

const basePromptSchema = buildPromptSchema('Prompt text');

export const FixPromptInputSchema = z.strictObject({
  prompt: basePromptSchema.describe('Prompt to fix'),
});

export const BoostPromptInputSchema = z.strictObject({
  prompt: basePromptSchema.describe('Prompt to boost'),
});
