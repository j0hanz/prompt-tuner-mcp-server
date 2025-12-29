import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export type ToolRegistrar = (server: McpServer) => void;

interface ResourceTextPayload {
  uri: string;
  text: string;
  mimeType?: string;
}

interface ResourceBlobPayload {
  uri: string;
  blob: string;
  mimeType?: string;
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'resource';
      resource: ResourceTextPayload | ResourceBlobPayload;
    }
  | {
      type: 'resource_link';
      uri: string;
      name: string;
      description?: string;
      mimeType?: string;
    };

export interface ErrorResponse {
  [key: string]: unknown;
  content: ContentBlock[];
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
  content: ContentBlock[];
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

export interface PatternCache {
  hasClaudePatterns: boolean;
  hasXmlStructure: boolean;
  hasMarkdownStructure: boolean;
  hasGptPatterns: boolean;
  hasJsonStructure: boolean;
  hasBoldOrHeaders: boolean;
  hasAngleBrackets: boolean;
  hasJsonChars: boolean;
  hasRole: boolean;
  hasExamples: boolean;
  hasStepByStep: boolean;
  isVague: boolean;
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
  techniquesApplied: OptimizationTechnique[];
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
