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

function buildPromptSchema(
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

function addEmptyRequestIssue(ctx: z.RefinementCtx): void {
  ctx.addIssue({
    code: 'too_small',
    origin: 'string',
    minimum: 1,
    inclusive: true,
    message:
      'Request is empty or contains only whitespace. Please provide a valid request.',
  });
}

function addTooLongRequestIssue(ctx: z.RefinementCtx, trimmed: string): void {
  ctx.addIssue({
    code: 'too_big',
    origin: 'string',
    maximum: MAX_PROMPT_LENGTH,
    inclusive: true,
    message: `Request exceeds maximum length after trimming: ${trimmed.length} characters (limit: ${MAX_PROMPT_LENGTH}). Please shorten your request.`,
  });
}

function enforceRequestLength(value: string, ctx: z.RefinementCtx): void {
  const trimmed = value.trim();
  if (trimmed.length < 1) {
    addEmptyRequestIssue(ctx);
    return;
  }

  if (trimmed.length > MAX_PROMPT_LENGTH) {
    addTooLongRequestIssue(ctx, trimmed);
  }
}

function buildRequestSchema(
  description: string
): z.ZodPipe<z.ZodString, z.ZodTransform<string, string>> {
  return z
    .string()
    .max(
      MAX_PROMPT_LENGTH * 2,
      `Request rejected: raw input exceeds ${MAX_PROMPT_LENGTH * 2} characters (including whitespace). Trim or shorten your request.`
    )
    .superRefine(enforceRequestLength)
    .transform((value) => value.trim())
    .describe(description);
}

const baseRequestSchema = buildRequestSchema('Task/request text');

const CRAFTING_PROMPT_MODES = [
  'general',
  'plan',
  'review',
  'troubleshoot',
] as const;

const CRAFTING_PROMPT_APPROACHES = [
  'conservative',
  'balanced',
  'creative',
] as const;

const CRAFTING_PROMPT_TONES = ['direct', 'neutral', 'friendly'] as const;

const CRAFTING_PROMPT_VERBOSITIES = ['brief', 'normal', 'detailed'] as const;

export const FixPromptInputSchema = z.strictObject({
  prompt: basePromptSchema.describe('Prompt to polish and refine'),
});

export const BoostPromptInputSchema = z.strictObject({
  prompt: basePromptSchema.describe('Prompt to transform and optimize'),
});

export const CraftingPromptInputSchema = z.strictObject({
  request: baseRequestSchema.describe(
    'Raw user request / task description to turn into a workflow prompt'
  ),
  constraints: baseRequestSchema
    .describe(
      'Optional: hard requirements to enforce (e.g., no breaking changes)'
    )
    .optional(),

  mode: z.enum(CRAFTING_PROMPT_MODES).optional().default('general'),
  approach: z.enum(CRAFTING_PROMPT_APPROACHES).optional().default('balanced'),
  tone: z.enum(CRAFTING_PROMPT_TONES).optional().default('direct'),
  verbosity: z.enum(CRAFTING_PROMPT_VERBOSITIES).optional().default('normal'),
});
