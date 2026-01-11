import { z } from 'zod';

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
  .strictObject({
    ok: z.boolean().describe('True if fixing succeeded'),
    fixed: z.string().optional().describe('Fixed prompt text'),
    error: ErrorSchema.optional().describe('Error details when ok=false'),
  })
  .describe('Fix prompt response');

export const BoostPromptOutputSchema = z
  .strictObject({
    ok: z.boolean().describe('True if boosting succeeded'),
    boosted: z.string().optional().describe('Boosted prompt text'),
    error: ErrorSchema.optional().describe('Error details when ok=false'),
  })
  .describe('Boost prompt response');
