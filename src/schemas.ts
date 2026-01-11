import { z } from 'zod';

import { MAX_PROMPT_LENGTH } from './config.js';

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
): z.ZodPipe<z.ZodString, z.ZodTransform<string, string>> {
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
  prompt: basePromptSchema.describe('Prompt to polish and refine'),
});

export const BoostPromptInputSchema = z.strictObject({
  prompt: basePromptSchema.describe('Prompt to transform and optimize'),
});

const ErrorSchema = z
  .object({
    code: z.string().describe('Machine-readable error code'),
    message: z.string().describe('Human-readable error message'),
    context: z.string().optional().describe('Safe, truncated context'),
    details: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Additional error details'),
    recoveryHint: z.string().optional().describe('Suggested recovery action'),
  })
  .describe('Error payload');

export const FixPromptOutputSchema = z
  .discriminatedUnion('ok', [
    z.strictObject({
      ok: z.literal(true).describe('True if polishing succeeded'),
      fixed: z.string().describe('Polished prompt text'),
    }),
    z.strictObject({
      ok: z.literal(false).describe('False if polishing failed'),
      error: ErrorSchema.describe('Error details when ok=false'),
    }),
  ])
  .describe('Fix prompt response');

export const BoostPromptOutputSchema = z
  .discriminatedUnion('ok', [
    z.strictObject({
      ok: z.literal(true).describe('True if transformation succeeded'),
      boosted: z.string().describe('Transformed and optimized prompt text'),
    }),
    z.strictObject({
      ok: z.literal(false).describe('False if transformation failed'),
      error: ErrorSchema.describe('Error details when ok=false'),
    }),
  ])
  .describe('Boost prompt response');
