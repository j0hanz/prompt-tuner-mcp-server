// Validate Prompt Tool - LLM-powered validation
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

import { LLM_TIMEOUT_MS, VALIDATE_MAX_TOKENS } from '../config/constants.js';
import type {
  ErrorResponse,
  ValidationIssue,
  ValidationResponse,
} from '../config/types.js';
import {
  createErrorResponse,
  createSuccessResponse,
  ErrorCode,
} from '../lib/errors.js';
import { getProviderInfo } from '../lib/llm-client.js';
import { wrapPromptData } from '../lib/prompt-policy.js';
import {
  executeLLMWithJsonResponse,
  extractPromptFromInput,
} from '../lib/tool-helpers.js';
import {
  ValidatePromptInputSchema,
  ValidatePromptOutputSchema,
} from '../schemas/index.js';
import { ValidationResponseSchema } from '../schemas/llm-responses.js';
import { TOKEN_LIMITS_BY_MODEL } from './validate-prompt/constants.js';
import { formatValidationOutput } from './validate-prompt/formatters.js';
import { VALIDATION_SYSTEM_PROMPT } from './validate-prompt/prompt.js';
import type { ValidationModel } from './validate-prompt/types.js';

const INJECTION_TERMS = [
  'injection',
  'prompt injection',
  'malicious',
  'payload',
  'exploit',
];

const TOOL_NAME = 'validate_prompt' as const;

interface ValidatePromptInput {
  prompt: string;
  targetModel?: string;
  checkInjection?: boolean;
}

interface ParsedValidatePromptInput {
  prompt: string;
  targetModel: ValidationModel;
  checkInjection: boolean;
}

const VALIDATE_PROMPT_TOOL = {
  title: 'Validate Prompt',
  description:
    'Pre-flight validation using AI: checks issues, estimates tokens, detects security risks. Returns isValid boolean and categorized issues.',
  inputSchema: ValidatePromptInputSchema,
  outputSchema: ValidatePromptOutputSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
};

function parseValidateInput(
  input: ValidatePromptInput
): ParsedValidatePromptInput {
  return ValidatePromptInputSchema.parse(input);
}

function resolveModelTokenLimit(targetModel: ValidationModel): number {
  return TOKEN_LIMITS_BY_MODEL[targetModel];
}

function issueMentionsInjection(issue: ValidationIssue): boolean {
  const text = `${issue.message} ${issue.suggestion ?? ''}`.toLowerCase();
  return INJECTION_TERMS.some((keyword) => text.includes(keyword));
}

function hasInjectionIssue(parsed: ValidationResponse): boolean {
  return parsed.issues.some(issueMentionsInjection);
}

function resolveValidationInputs(input: ParsedValidatePromptInput): {
  targetModel: ValidationModel;
  checkInjection: boolean;
  validationPrompt: string;
} {
  const { targetModel, checkInjection } = input;
  const validationPrompt = buildValidationPrompt(
    input.prompt,
    targetModel,
    checkInjection
  );
  return { targetModel, checkInjection, validationPrompt };
}

function buildValidationPrompt(
  validatedPrompt: string,
  targetModel: ValidationModel,
  checkInjection: boolean
): string {
  return `${VALIDATION_SYSTEM_PROMPT}\n\nTarget Model: ${targetModel}\nCheck Injection: ${String(
    checkInjection
  )}\n\n<prompt_to_validate>\n${wrapPromptData(
    validatedPrompt
  )}\n</prompt_to_validate>`;
}

async function requestValidation(
  validationPrompt: string,
  signal: AbortSignal
): Promise<ValidationResponse> {
  const { value } = await executeLLMWithJsonResponse<ValidationResponse>(
    validationPrompt,
    (value) => ValidationResponseSchema.parse(value),
    ErrorCode.E_LLM_FAILED,
    TOOL_NAME,
    {
      maxTokens: VALIDATE_MAX_TOKENS,
      timeoutMs: LLM_TIMEOUT_MS,
      signal,
      retryOnParseFailure: true,
    }
  );
  return value;
}

function buildSecurityFlags(
  parsed: ValidationResponse,
  checkInjection: boolean
): string[] {
  return checkInjection && hasInjectionIssue(parsed)
    ? ['injection_detected']
    : [];
}

function buildValidationResponse(
  parsed: ValidationResponse,
  targetModel: ValidationModel,
  checkInjection: boolean,
  tokenLimit: number,
  provider: { provider: string; model: string }
): ReturnType<typeof createSuccessResponse> {
  const output = formatValidationOutput(
    parsed,
    targetModel,
    tokenLimit,
    provider
  );
  const securityFlags = buildSecurityFlags(parsed, checkInjection);
  const tokenUtilization = Math.round(
    (parsed.tokenEstimate / tokenLimit) * 100
  );
  const overLimit = parsed.tokenEstimate > tokenLimit;

  return createSuccessResponse(output, {
    ok: true,
    isValid: parsed.isValid,
    issues: parsed.issues,
    tokenEstimate: parsed.tokenEstimate,
    tokenLimit,
    tokenUtilization,
    overLimit,
    targetModel,
    securityFlags,
    provider: provider.provider,
    model: provider.model,
  });
}

async function handleValidatePrompt(
  input: ValidatePromptInput,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<ReturnType<typeof createSuccessResponse> | ErrorResponse> {
  try {
    const parsed = parseValidateInput(input);
    const { targetModel, checkInjection, validationPrompt } =
      resolveValidationInputs(parsed);
    const validation = await requestValidation(validationPrompt, extra.signal);
    const tokenLimit = resolveModelTokenLimit(targetModel);
    const provider = await getProviderInfo();
    return buildValidationResponse(
      validation,
      targetModel,
      checkInjection,
      tokenLimit,
      provider
    );
  } catch (error) {
    return createErrorResponse(
      error,
      ErrorCode.E_LLM_FAILED,
      extractPromptFromInput(input)
    );
  }
}

// Registers the validate_prompt tool with the MCP server
export function registerValidatePromptTool(server: McpServer): void {
  server.registerTool(TOOL_NAME, VALIDATE_PROMPT_TOOL, handleValidatePrompt);
}
