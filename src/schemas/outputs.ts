import { z } from 'zod';

import { OPTIMIZATION_TECHNIQUES, TARGET_FORMATS } from '../config/types.js';

const ErrorSchema = z
  .object({
    code: z.string().describe('Machine-readable error code'),
    message: z.string().describe('Human-readable error message'),
    context: z.string().optional().describe('Safe, truncated context'),
    details: z
      .record(z.unknown())
      .optional()
      .describe('Additional error details'),
    recoveryHint: z.string().optional().describe('Suggested recovery action'),
  })
  .describe('Error payload');

const ScoreSchema = z
  .object({
    clarity: z.number().min(0).max(100).describe('Clarity score (0-100)'),
    specificity: z
      .number()
      .min(0)
      .max(100)
      .describe('Specificity score (0-100)'),
    completeness: z
      .number()
      .min(0)
      .max(100)
      .describe('Completeness score (0-100)'),
    structure: z.number().min(0).max(100).describe('Structure score (0-100)'),
    effectiveness: z
      .number()
      .min(0)
      .max(100)
      .describe('Effectiveness score (0-100)'),
    overall: z.number().min(0).max(100).describe('Overall score (0-100)'),
  })
  .describe('Score breakdown');

const ScoreDeltaSchema = z
  .object({
    clarity: z.number().min(-100).max(100).describe('Delta clarity score'),
    specificity: z
      .number()
      .min(-100)
      .max(100)
      .describe('Delta specificity score'),
    completeness: z
      .number()
      .min(-100)
      .max(100)
      .describe('Delta completeness score'),
    structure: z.number().min(-100).max(100).describe('Delta structure score'),
    effectiveness: z
      .number()
      .min(-100)
      .max(100)
      .describe('Delta effectiveness score'),
    overall: z.number().min(-100).max(100).describe('Delta overall score'),
  })
  .describe('Score deltas (B minus A)');

const CharacteristicsSchema = z
  .object({
    detectedFormat: z.enum(TARGET_FORMATS).describe('Detected prompt format'),
    hasExamples: z.boolean().describe('Whether examples are present'),
    hasRoleContext: z.boolean().describe('Whether a role/persona is defined'),
    hasStructure: z
      .boolean()
      .describe('Whether structured sections are present'),
    hasStepByStep: z
      .boolean()
      .describe('Whether step-by-step guidance is present'),
    wordCount: z.number().describe('Total word count'),
    estimatedComplexity: z
      .enum(['simple', 'moderate', 'complex'])
      .describe('Estimated complexity level'),
  })
  .describe('Detected characteristics');

const TechniqueSchema = z
  .enum(OPTIMIZATION_TECHNIQUES)
  .describe('Optimization technique identifier');

const ValidationIssueSchema = z
  .object({
    type: z.enum(['error', 'warning', 'info']).describe('Issue severity'),
    message: z.string().describe('Issue description'),
    suggestion: z.string().optional().describe('Suggested fix'),
  })
  .describe('Validation issue');

export const RefinePromptOutputSchema = z
  .object({
    ok: z.boolean().describe('True if refinement succeeded'),
    original: z.string().optional().describe('Original prompt text'),
    refined: z.string().optional().describe('Refined prompt text'),
    corrections: z.array(z.string()).optional().describe('Applied corrections'),
    technique: TechniqueSchema.optional().describe('Technique used'),
    targetFormat: z.enum(TARGET_FORMATS).optional().describe('Resolved format'),
    usedFallback: z
      .boolean()
      .optional()
      .describe('Whether a fallback was used'),
    fromCache: z.boolean().optional().describe('Whether result was cached'),
    error: ErrorSchema.optional().describe('Error details when ok=false'),
  })
  .describe('Refine prompt response');

export const AnalyzePromptOutputSchema = z
  .object({
    ok: z.boolean().describe('True if analysis succeeded'),
    hasTypos: z.boolean().optional().describe('Typos detected'),
    isVague: z.boolean().optional().describe('Vague language detected'),
    missingContext: z.boolean().optional().describe('Missing context detected'),
    suggestions: z
      .array(z.string())
      .optional()
      .describe('Improvement suggestions'),
    score: ScoreSchema.optional().describe('Score breakdown'),
    characteristics: CharacteristicsSchema.optional().describe(
      'Prompt characteristics'
    ),
    error: ErrorSchema.optional().describe('Error details when ok=false'),
  })
  .describe('Analyze prompt response');

export const OptimizePromptOutputSchema = z
  .object({
    ok: z.boolean().describe('True if optimization succeeded'),
    original: z.string().optional().describe('Original prompt text'),
    optimized: z.string().optional().describe('Optimized prompt text'),
    techniquesApplied: z
      .array(TechniqueSchema)
      .optional()
      .describe('Techniques actually applied'),
    targetFormat: z.enum(TARGET_FORMATS).optional().describe('Resolved format'),
    beforeScore: ScoreSchema.optional().describe('Scores before optimization'),
    afterScore: ScoreSchema.optional().describe('Scores after optimization'),
    scoreDelta: z
      .number()
      .optional()
      .describe('After minus before overall score'),
    improvements: z
      .array(z.string())
      .optional()
      .describe('List of improvements'),
    usedFallback: z
      .boolean()
      .optional()
      .describe('Whether a fallback was used'),
    error: ErrorSchema.optional().describe('Error details when ok=false'),
  })
  .describe('Optimize prompt response');

export const DetectFormatOutputSchema = z
  .object({
    ok: z.boolean().describe('True if detection succeeded'),
    detectedFormat: z
      .enum(TARGET_FORMATS)
      .optional()
      .describe('Detected format'),
    confidence: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe('Confidence score'),
    characteristics: CharacteristicsSchema.optional().describe(
      'Detected characteristics'
    ),
    recommendation: z.string().optional().describe('Format recommendation'),
    error: ErrorSchema.optional().describe('Error details when ok=false'),
  })
  .describe('Detect format response');

export const ComparePromptsOutputSchema = z
  .object({
    ok: z.boolean().describe('True if comparison succeeded'),
    promptA: z.string().optional().describe('Prompt A text'),
    promptB: z.string().optional().describe('Prompt B text'),
    scoreA: ScoreSchema.optional().describe('Scores for prompt A'),
    scoreB: ScoreSchema.optional().describe('Scores for prompt B'),
    scoreDelta: ScoreDeltaSchema.optional().describe('B minus A deltas'),
    winner: z.enum(['A', 'B', 'tie']).optional().describe('Winner label'),
    improvements: z
      .array(z.string())
      .optional()
      .describe('Improvements in prompt B'),
    regressions: z
      .array(z.string())
      .optional()
      .describe('Regressions in prompt B'),
    recommendation: z.string().optional().describe('Overall recommendation'),
    error: ErrorSchema.optional().describe('Error details when ok=false'),
  })
  .describe('Compare prompts response');

export const ValidatePromptOutputSchema = z
  .object({
    ok: z.boolean().describe('True if validation succeeded'),
    isValid: z.boolean().optional().describe('Overall validity'),
    issues: z
      .array(ValidationIssueSchema)
      .optional()
      .describe('Validation issues'),
    tokenEstimate: z.number().optional().describe('Estimated token count'),
    securityFlags: z.array(z.string()).optional().describe('Security flags'),
    error: ErrorSchema.optional().describe('Error details when ok=false'),
  })
  .describe('Validate prompt response');
