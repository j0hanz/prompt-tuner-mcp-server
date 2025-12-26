import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export type ToolRegistrar = (server: McpServer) => void;

export interface ErrorResponse {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  structuredContent: {
    ok: false;
    error: {
      code: string;
      message: string;
      context?: string;
      details?: Record<string, unknown>;
      recoveryHint?: string;
    };
  };
  isError: true;
}

export interface SuccessResponse<T extends Record<string, unknown>> {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  structuredContent: T;
}

export interface TechniqueTemplate {
  name: OptimizationTechnique;
  description: string;
  systemPrompt: string;
}

export const OPTIMIZATION_TECHNIQUES = [
  'basic',
  'chainOfThought',
  'fewShot',
  'roleBased',
  'structured',
  'comprehensive',
] as const satisfies readonly [string, string, ...string[]];

export type OptimizationTechnique = (typeof OPTIMIZATION_TECHNIQUES)[number];

export const TARGET_FORMATS = [
  'auto',
  'claude',
  'gpt',
  'json',
] as const satisfies readonly [string, string, ...string[]];

export type TargetFormat = (typeof TARGET_FORMATS)[number];

export interface PromptScore {
  clarity: number;
  specificity: number;
  completeness: number;
  structure: number;
  effectiveness: number;
  overall: number;
}

export interface PromptCharacteristics {
  detectedFormat: TargetFormat;
  hasExamples: boolean;
  hasRoleContext: boolean;
  hasStructure: boolean;
  hasStepByStep: boolean;
  wordCount: number;
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
}

export interface SuggestionContext {
  prompt: string;
  characteristics: PromptCharacteristics;
  score: PromptScore;
}

export type SuggestionGenerator = (ctx: SuggestionContext) => string | null;

export interface PatternCache {
  hasClaudePatterns: boolean;
  hasXmlStructure: boolean;
  hasMarkdownStructure: boolean;
  hasGptPatterns: boolean;
  hasJsonStructure: boolean;
  hasBoldOrHeaders: boolean;
  hasAngleBrackets: boolean;
  hasJsonChars: boolean;
}

export interface FormatScoringConfig {
  positive: { key: keyof PatternCache; weight: number }[];
  negative: { key: keyof PatternCache; weight: number }[];
}

export interface FormatResult {
  net: number;
  format: TargetFormat;
  recommendation: string;
  rawScore: number;
}

export type LLMProvider = 'openai' | 'anthropic' | 'google';

export type ValidProvider = 'openai' | 'anthropic' | 'google';

export interface SafeErrorDetails {
  status?: number;
  code?: string;
}

export interface LLMError {
  status?: number;
  code?: string;
  message?: string;
}

export interface LLMRequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  requestId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface LLMClient {
  generateText(
    prompt: string,
    maxTokens?: number,
    options?: LLMRequestOptions
  ): Promise<string>;
  getProvider(): LLMProvider;
  getModel(): string;
}

export interface LLMToolOptions {
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  totalTimeoutMs?: number;
}

export type LogFormat = 'json' | 'text';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface McpErrorOptions {
  context?: string;
  details?: Record<string, unknown>;
  recoveryHint?: string;
}

export const ErrorCode = {
  E_INVALID_INPUT: 'E_INVALID_INPUT',
  E_LLM_FAILED: 'E_LLM_FAILED',
  E_LLM_RATE_LIMITED: 'E_LLM_RATE_LIMITED',
  E_LLM_AUTH_FAILED: 'E_LLM_AUTH_FAILED',
  E_TIMEOUT: 'E_TIMEOUT',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface OptimizeScore {
  clarity: number;
  specificity: number;
  completeness: number;
  structure: number;
  effectiveness: number;
  overall: number;
}

export interface OptimizeResponse {
  optimized: string;
  techniquesApplied: string[];
  improvements: string[];
  beforeScore: OptimizeScore;
  afterScore: OptimizeScore;
}

export interface AnalysisCharacteristics {
  hasTypos: boolean;
  isVague: boolean;
  missingContext: boolean;
  hasRoleContext: boolean;
  hasExamples: boolean;
  hasStructure: boolean;
  hasStepByStep: boolean;
  wordCount: number;
  detectedFormat: 'claude' | 'gpt' | 'json' | 'auto';
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
}

export interface AnalysisResponse {
  score: OptimizeScore;
  characteristics: AnalysisCharacteristics;
  suggestions: string[];
}

export interface ComparisonResponse {
  winner: 'A' | 'B' | 'tie';
  scoreA: OptimizeScore;
  scoreB: OptimizeScore;
  improvements: string[];
  regressions: string[];
  recommendation: string;
}

export interface ValidationIssue {
  type: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
}

export interface ValidationResponse {
  isValid: boolean;
  tokenEstimate: number;
  issues: ValidationIssue[];
}

export interface FormatDetectionResponse {
  detectedFormat: 'claude' | 'gpt' | 'json' | 'auto';
  confidence: number;
  recommendation: string;
}
