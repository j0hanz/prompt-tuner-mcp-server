import { z } from 'zod';

import { OPTIMIZATION_TECHNIQUES } from '../config/types.js';

const ScoreSchema = z.int().min(0).max(100);

const OptimizeScoreSchema = z.object({
  clarity: ScoreSchema,
  specificity: ScoreSchema,
  completeness: ScoreSchema,
  structure: ScoreSchema,
  effectiveness: ScoreSchema,
  overall: ScoreSchema,
});

export const OptimizeResponseSchema = z.object({
  optimized: z.string().min(1).describe('The fully optimized prompt'),
  techniquesApplied: z
    .array(z.enum(OPTIMIZATION_TECHNIQUES))
    .min(1)
    .describe('Techniques applied'),
  improvements: z.array(z.string()).describe('List of improvements made'),
  beforeScore: OptimizeScoreSchema,
  afterScore: OptimizeScoreSchema,
});

const AnalysisCharacteristicsSchema = z.object({
  hasTypos: z.boolean(),
  isVague: z.boolean(),
  missingContext: z.boolean(),
  hasRoleContext: z.boolean(),
  hasExamples: z.boolean(),
  hasStructure: z.boolean(),
  hasStepByStep: z.boolean(),
  wordCount: z.int().min(0),
  detectedFormat: z.enum(['claude', 'gpt', 'json', 'auto']),
  estimatedComplexity: z.enum(['simple', 'moderate', 'complex']),
});

export const AnalysisResponseSchema = z.object({
  score: OptimizeScoreSchema,
  characteristics: AnalysisCharacteristicsSchema,
  suggestions: z.array(z.string()).describe('Improvement suggestions'),
});

const ValidationIssueSchema = z.object({
  type: z.enum(['error', 'warning', 'info']),
  message: z.string(),
  suggestion: z.string().optional(),
});

export const ValidationResponseSchema = z.object({
  isValid: z.boolean(),
  tokenEstimate: z.int().min(0),
  issues: z.array(ValidationIssueSchema),
});
