import { z } from 'zod';

import { OPTIMIZATION_TECHNIQUES, TARGET_FORMATS } from '../config/types.js';

// Schema for error details in responses
const ErrorSchema = z.object({
  code: z.string().describe('Error code (e.g., E_INVALID_INPUT)'),
  message: z.string().describe('Human-readable error message'),
  context: z.string().optional().describe('Additional context (truncated)'),
  details: z
    .record(z.unknown())
    .optional()
    .describe('Additional error details'),
});

// Schema for prompt analysis scores (0-100 for each dimension)
const ScoreSchema = z.object({
  clarity: z.number().min(0).max(100).describe('How clear and unambiguous'),
  specificity: z.number().min(0).max(100).describe('How specific and detailed'),
  completeness: z
    .number()
    .min(0)
    .max(100)
    .describe('How complete with context'),
  structure: z.number().min(0).max(100).describe('How well-organized'),
  effectiveness: z.number().min(0).max(100).describe('Predicted effectiveness'),
  overall: z.number().min(0).max(100).describe('Weighted overall score'),
});

// Schema for detected prompt characteristics
const CharacteristicsSchema = z.object({
  detectedFormat: z.enum(TARGET_FORMATS).describe('Detected target format'),
  hasExamples: z.boolean().describe('Contains examples'),
  hasRoleContext: z.boolean().describe('Has role/persona defined'),
  hasStructure: z.boolean().describe('Has XML/Markdown structure'),
  hasStepByStep: z.boolean().describe('Has step-by-step guidance'),
  wordCount: z.number().describe('Total word count'),
  estimatedComplexity: z
    .enum(['simple', 'moderate', 'complex'])
    .describe('Estimated complexity'),
});

const techniqueSchema = z.enum(OPTIMIZATION_TECHNIQUES);

export const RefinePromptOutputSchema = {
  ok: z.boolean(),
  original: z.string().optional(),
  refined: z.string().optional(),
  corrections: z.array(z.string()).optional(),
  technique: techniqueSchema.optional(),
  targetFormat: z.enum(TARGET_FORMATS).optional(),
  usedFallback: z.boolean().optional(),
  fromCache: z.boolean().optional(),
  error: ErrorSchema.optional(),
};

export const AnalyzePromptOutputSchema = {
  ok: z.boolean(),
  hasTypos: z.boolean().optional(),
  isVague: z.boolean().optional(),
  missingContext: z.boolean().optional(),
  suggestions: z.array(z.string()).optional(),
  score: ScoreSchema.optional(),
  characteristics: CharacteristicsSchema.optional(),
  error: ErrorSchema.optional(),
};

export const OptimizePromptOutputSchema = {
  ok: z.boolean(),
  original: z.string().optional(),
  optimized: z.string().optional(),
  techniquesApplied: z.array(techniqueSchema).optional(),
  targetFormat: z.enum(TARGET_FORMATS).optional(),
  beforeScore: ScoreSchema.optional(),
  afterScore: ScoreSchema.optional(),
  scoreDelta: z
    .number()
    .describe('Difference between after and before overall scores')
    .optional(),
  improvements: z.array(z.string()).optional(),
  usedFallback: z.boolean().optional(),
  error: ErrorSchema.optional(),
};

export const DetectFormatOutputSchema = {
  ok: z.boolean(),
  detectedFormat: z.enum(TARGET_FORMATS).optional(),
  confidence: z.number().min(0).max(100).optional(),
  characteristics: CharacteristicsSchema.optional(),
  recommendation: z.string().optional(),
  error: ErrorSchema.optional(),
};

export const ComparePromptsOutputSchema = {
  ok: z.boolean(),
  promptA: z.string().optional(),
  promptB: z.string().optional(),
  scoreA: ScoreSchema.optional(),
  scoreB: ScoreSchema.optional(),
  scoreDelta: ScoreSchema.optional(),
  winner: z.enum(['A', 'B', 'tie']).optional(),
  improvements: z.array(z.string()).optional(),
  regressions: z.array(z.string()).optional(),
  recommendation: z.string().optional(),
  error: ErrorSchema.optional(),
};

export const ValidatePromptOutputSchema = {
  ok: z.boolean(),
  isValid: z.boolean().optional(),
  issues: z
    .array(
      z.object({
        type: z.enum(['error', 'warning', 'info']),
        message: z.string(),
        suggestion: z.string().optional(),
      })
    )
    .optional(),
  tokenEstimate: z.number().optional(),
  securityFlags: z.array(z.string()).optional(),
  error: ErrorSchema.optional(),
};
