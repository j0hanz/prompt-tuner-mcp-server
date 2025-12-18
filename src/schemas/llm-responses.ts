// Zod schemas for validating LLM responses
import { z } from 'zod';

// Re-export types from centralized types.ts
export type {
  AnalysisCharacteristics,
  AnalysisResponse,
  ComparisonResponse,
  FormatDetectionResponse,
  OptimizeResponse,
  OptimizeScore,
  ValidationIssue,
  ValidationResponse,
} from '../config/types.js';

/**
 * Schema for score values (0-100).
 */
const ScoreSchema = z.number().int().min(0).max(100);

/**
 * Schema for optimization scores across dimensions.
 */
export const OptimizeScoreSchema = z.object({
  clarity: ScoreSchema,
  specificity: ScoreSchema,
  completeness: ScoreSchema,
  structure: ScoreSchema,
  effectiveness: ScoreSchema,
  overall: ScoreSchema,
});

/**
 * Schema for optimize_prompt LLM response.
 */
export const OptimizeResponseSchema = z.object({
  optimized: z.string().min(1).describe('The fully optimized prompt'),
  techniquesApplied: z.array(z.string()).min(1).describe('Techniques applied'),
  improvements: z.array(z.string()).describe('List of improvements made'),
  beforeScore: OptimizeScoreSchema,
  afterScore: OptimizeScoreSchema,
});

/**
 * Schema for analysis characteristics.
 */
export const AnalysisCharacteristicsSchema = z.object({
  hasTypos: z.boolean(),
  isVague: z.boolean(),
  missingContext: z.boolean(),
  hasRoleContext: z.boolean(),
  hasExamples: z.boolean(),
  hasStructure: z.boolean(),
  hasStepByStep: z.boolean(),
  wordCount: z.number().int().min(0),
  detectedFormat: z.enum(['claude', 'gpt', 'json', 'auto']),
  estimatedComplexity: z.enum(['simple', 'moderate', 'complex']),
});

/**
 * Schema for analyze_prompt LLM response.
 */
export const AnalysisResponseSchema = z.object({
  score: OptimizeScoreSchema,
  characteristics: AnalysisCharacteristicsSchema,
  suggestions: z.array(z.string()).describe('Improvement suggestions'),
});

/**
 * Schema for comparison response.
 */
export const ComparisonResponseSchema = z.object({
  winner: z.enum(['A', 'B', 'tie']),
  scoreA: OptimizeScoreSchema,
  scoreB: OptimizeScoreSchema,
  improvements: z.array(z.string()),
  regressions: z.array(z.string()),
  recommendation: z.string(),
});

/**
 * Schema for validation issue.
 */
export const ValidationIssueSchema = z.object({
  type: z.enum(['error', 'warning', 'info']),
  message: z.string(),
  suggestion: z.string().optional(),
});

/**
 * Schema for validate_prompt LLM response.
 */
export const ValidationResponseSchema = z.object({
  isValid: z.boolean(),
  tokenEstimate: z.number().int().min(0),
  issues: z.array(ValidationIssueSchema),
});

/**
 * Schema for format detection response.
 */
export const FormatDetectionResponseSchema = z.object({
  detectedFormat: z.enum(['claude', 'gpt', 'json', 'auto']),
  confidence: z.number().int().min(0).max(100),
  recommendation: z.string(),
});
