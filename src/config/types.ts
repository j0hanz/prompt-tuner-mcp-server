interface ResourceTextPayload {
  readonly uri: string;
  readonly text: string;
  readonly mimeType?: string;
}

export type ContentBlock =
  | { readonly type: 'text'; readonly text: string }
  | {
      readonly type: 'resource';
      readonly resource: ResourceTextPayload;
    };

export interface ErrorResponse {
  [key: string]: unknown;
  readonly content: ContentBlock[];
  readonly structuredContent: {
    readonly ok: false;
    readonly error: {
      readonly code: string;
      readonly message: string;
      readonly context?: string;
      readonly details?: Record<string, unknown>;
      readonly recoveryHint?: string;
    };
  };
  readonly isError: true;
}

export interface SuccessResponse<T extends Record<string, unknown>> {
  [key: string]: unknown;
  readonly content: ContentBlock[];
  readonly structuredContent: T;
}

export interface TechniqueTemplate {
  readonly name: OptimizationTechnique;
  readonly description: string;
  readonly systemPrompt: string;
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
  readonly hasClaudePatterns: boolean;
  readonly hasXmlStructure: boolean;
  readonly hasMarkdownStructure: boolean;
  readonly hasGptPatterns: boolean;
  readonly hasJsonStructure: boolean;
  readonly hasBoldOrHeaders: boolean;
  readonly hasAngleBrackets: boolean;
  readonly hasJsonChars: boolean;
  readonly hasRole: boolean;
  readonly hasExamples: boolean;
  readonly hasStepByStep: boolean;
  readonly isVague: boolean;
}

export interface FormatScoringConfig {
  readonly positive: readonly {
    readonly key: keyof PatternCache;
    readonly weight: number;
  }[];
  readonly negative: readonly {
    readonly key: keyof PatternCache;
    readonly weight: number;
  }[];
}

export interface FormatResult {
  readonly net: number;
  readonly format: TargetFormat;
  readonly recommendation: string;
  readonly rawScore: number;
}

export type LLMProvider = 'openai' | 'anthropic' | 'google';

export interface ProviderInfo {
  readonly provider: LLMProvider;
  readonly model: string;
}

export interface SafeErrorDetails {
  readonly status?: number;
  readonly code?: string;
}

export interface LLMError {
  readonly status?: number;
  readonly code?: string;
  readonly message?: string;
}

export interface LLMRequestOptions {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly requestId?: string;
  readonly sessionId?: string;
  readonly metadata?: Record<string, unknown>;
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
  readonly maxTokens?: number;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export interface McpErrorOptions {
  readonly context?: string;
  readonly details?: Record<string, unknown>;
  readonly recoveryHint?: string;
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
  readonly clarity: number;
  readonly specificity: number;
  readonly completeness: number;
  readonly structure: number;
  readonly effectiveness: number;
  readonly overall: number;
}

export interface OptimizeResponse {
  readonly optimized: string;
  readonly techniquesApplied: readonly OptimizationTechnique[];
  readonly improvements: readonly string[];
  readonly beforeScore: OptimizeScore;
  readonly afterScore: OptimizeScore;
}

export interface AnalysisCharacteristics {
  readonly hasTypos: boolean;
  readonly isVague: boolean;
  readonly missingContext: boolean;
  readonly hasRoleContext: boolean;
  readonly hasExamples: boolean;
  readonly hasStructure: boolean;
  readonly hasStepByStep: boolean;
  readonly wordCount: number;
  readonly detectedFormat: 'claude' | 'gpt' | 'json' | 'auto';
  readonly estimatedComplexity: 'simple' | 'moderate' | 'complex';
}

export interface AnalysisResponse {
  readonly score: OptimizeScore;
  readonly characteristics: AnalysisCharacteristics;
  readonly suggestions: readonly string[];
}

export interface ValidationIssue {
  readonly type: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly suggestion?: string;
}

export interface ValidationResponse {
  readonly isValid: boolean;
  readonly tokenEstimate: number;
  readonly issues: readonly ValidationIssue[];
}
