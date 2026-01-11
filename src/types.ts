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
