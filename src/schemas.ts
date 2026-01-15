import { z } from 'zod';

import { MAX_PROMPT_LENGTH } from './config.js';

const RAW_INPUT_MAX = MAX_PROMPT_LENGTH * 2;

interface TextFieldMessages {
  empty: string;
  tooLong: (trimmedLength: number) => string;
  rawTooLong: string;
}

function buildTextFieldMessages(label: string): TextFieldMessages {
  const lowerLabel = label.toLowerCase();
  return {
    empty: `${label} is empty or contains only whitespace. Please provide a valid ${lowerLabel}.`,
    tooLong: (trimmedLength) =>
      `${label} exceeds maximum length after trimming: ${trimmedLength} characters (limit: ${MAX_PROMPT_LENGTH}). Please shorten your ${lowerLabel}.`,
    rawTooLong: `${label} rejected: raw input exceeds ${RAW_INPUT_MAX} characters (including whitespace). Trim or shorten your ${lowerLabel}.`,
  };
}

function enforceTrimmedLength(
  value: string,
  ctx: z.RefinementCtx,
  messages: TextFieldMessages
): void {
  const trimmed = value.trim();
  if (trimmed.length < 1) {
    ctx.addIssue({
      code: 'too_small',
      origin: 'string',
      minimum: 1,
      inclusive: true,
      message: messages.empty,
    });
    return;
  }

  if (trimmed.length > MAX_PROMPT_LENGTH) {
    ctx.addIssue({
      code: 'too_big',
      origin: 'string',
      maximum: MAX_PROMPT_LENGTH,
      inclusive: true,
      message: messages.tooLong(trimmed.length),
    });
  }
}

function buildTrimmedTextSchema(
  label: string,
  description: string
): z.ZodPipe<z.ZodString, z.ZodTransform<string, string>> {
  const messages = buildTextFieldMessages(label);
  return z
    .string()
    .max(RAW_INPUT_MAX, messages.rawTooLong)
    .superRefine((value, ctx) => {
      enforceTrimmedLength(value, ctx, messages);
    })
    .transform((value) => value.trim())
    .describe(description);
}

const basePromptSchema = buildTrimmedTextSchema('Prompt', 'Prompt text');
const baseRequestSchema = buildTrimmedTextSchema(
  'Request',
  'Task/request text'
);

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
