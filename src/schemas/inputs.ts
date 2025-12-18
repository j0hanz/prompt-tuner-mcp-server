// Zod input schemas for PromptTuner MCP
import { z } from 'zod';

import { MAX_PROMPT_LENGTH } from '../config/constants.js';
import { OPTIMIZATION_TECHNIQUES, TARGET_FORMATS } from '../config/types.js';

const promptSchema = z
  .string()
  .min(1, 'Prompt cannot be empty')
  .max(
    MAX_PROMPT_LENGTH,
    `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`
  )
  .describe('Prompt text to improve (plain text, Markdown, or XML)');

const techniqueSchema = z
  .enum(OPTIMIZATION_TECHNIQUES)
  .describe(
    'basic | chainOfThought | fewShot | roleBased | structured | comprehensive'
  );

const targetFormatSchema = z
  .enum(TARGET_FORMATS)
  .describe('auto | claude | gpt | json');

export const RefinePromptInputSchema = {
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
};

export const AnalyzePromptInputSchema = {
  prompt: promptSchema,
};

export const OptimizePromptInputSchema = {
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
};

export const DetectFormatInputSchema = {
  prompt: promptSchema,
};

export const ComparePromptsInputSchema = {
  promptA: promptSchema.describe('First prompt to compare'),
  promptB: promptSchema.describe('Second prompt to compare'),
  labelA: z
    .string()
    .optional()
    .default('Prompt A')
    .describe('Label for first prompt'),
  labelB: z
    .string()
    .optional()
    .default('Prompt B')
    .describe('Label for second prompt'),
};

export const ValidatePromptInputSchema = {
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
};
