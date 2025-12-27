// Validate Prompt Tool - LLM-powered validation
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

import {
  VALIDATE_MAX_TOKENS,
  VALIDATE_TIMEOUT_MS,
} from '../config/constants.js';
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
import { getToolContext } from '../lib/tool-context.js';
import {
  asBulletList,
  buildOutput,
  formatProviderLine,
} from '../lib/tool-formatters.js';
import { executeLLMWithJsonResponse } from '../lib/tool-helpers.js';
import { validatePrompt } from '../lib/validation.js';
import {
  ValidatePromptInputSchema,
  ValidatePromptOutputSchema,
} from '../schemas/index.js';
import { ValidationResponseSchema } from '../schemas/llm-responses.js';
import { VALIDATION_SYSTEM_PROMPT } from './validate-prompt/prompt.js';

const INJECTION_TERMS = [
  'injection',
  'prompt injection',
  'malicious',
  'payload',
  'exploit',
];

const TOKEN_LIMITS_BY_MODEL = {
  claude: 200000,
  gpt: 128000,
  gemini: 1000000,
  generic: 8000,
} as const;

type ValidationModel = keyof typeof TOKEN_LIMITS_BY_MODEL;
const DEFAULT_VALIDATION_MODEL: ValidationModel = 'generic';

const TOOL_NAME = 'validate_prompt' as const;

interface ValidatePromptInput {
  prompt: string;
  targetModel?: string;
  checkInjection?: boolean;
}

interface OutputSection {
  title: string;
  lines: string[];
}

const VALIDATE_PROMPT_TOOL = {
  title: 'Validate Prompt',
  description:
    'Pre-flight validation using AI: checks issues, estimates tokens, detects security risks. Returns isValid boolean and categorized issues.',
  inputSchema: ValidatePromptInputSchema.shape,
  outputSchema: ValidatePromptOutputSchema.shape,
  annotations: {
    readOnlyHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
};

function formatIssueLine(issue: ValidationIssue): string {
  if (!issue.suggestion) return issue.message;
  return `${issue.message} | Suggestion: ${issue.suggestion}`;
}

function normalizeTargetModel(model?: string): ValidationModel {
  const normalized = model?.toLowerCase() ?? DEFAULT_VALIDATION_MODEL;
  return normalized in TOKEN_LIMITS_BY_MODEL
    ? (normalized as ValidationModel)
    : DEFAULT_VALIDATION_MODEL;
}

function resolveModelTokenLimit(targetModel: ValidationModel): number {
  return TOKEN_LIMITS_BY_MODEL[targetModel];
}

function buildSummaryLines(
  parsed: ValidationResponse,
  targetModel: ValidationModel,
  tokenLimit: number
): string[] {
  const overLimit = parsed.tokenEstimate > tokenLimit;
  const utilization = Math.round((parsed.tokenEstimate / tokenLimit) * 100);
  return [
    `Status: ${parsed.isValid ? 'Valid' : 'Invalid'}`,
    `Target model: ${targetModel}`,
    `Token estimate: ~${parsed.tokenEstimate} (limit ${tokenLimit})`,
    `Token utilization: ${utilization}%`,
    `Over limit: ${overLimit ? 'Yes' : 'No'}`,
  ];
}

function buildIssueSections(parsed: ValidationResponse): OutputSection[] {
  const groups: { label: string; type: ValidationIssue['type'] }[] = [
    { label: 'Errors', type: 'error' },
    { label: 'Warnings', type: 'warning' },
    { label: 'Info', type: 'info' },
  ];

  return groups.flatMap((group) => {
    const items = parsed.issues.filter((issue) => issue.type === group.type);
    if (!items.length) return [];
    return [
      {
        title: `${group.label} (${items.length})`,
        lines: asBulletList(items.map(formatIssueLine)),
      },
    ];
  });
}

function formatValidationOutput(
  parsed: ValidationResponse,
  targetModel: ValidationModel,
  tokenLimit: number,
  provider: { provider: string; model: string }
): string {
  const sections: OutputSection[] = [
    {
      title: 'Summary',
      lines: asBulletList(buildSummaryLines(parsed, targetModel, tokenLimit)),
    },
    ...buildIssueSections(parsed),
  ];

  return buildOutput(
    'Prompt Validation',
    [formatProviderLine(provider)],
    sections,
    [parsed.isValid ? 'Prompt is ready to use.' : 'Fix errors before use.']
  );
}

function issueMentionsInjection(issue: ValidationIssue): boolean {
  const text = `${issue.message} ${issue.suggestion ?? ''}`.toLowerCase();
  return INJECTION_TERMS.some((keyword) => text.includes(keyword));
}

function hasInjectionIssue(parsed: ValidationResponse): boolean {
  return parsed.issues.some(issueMentionsInjection);
}

function resolveValidationModel(input: ValidatePromptInput): ValidationModel {
  return normalizeTargetModel(input.targetModel);
}

function resolveCheckInjection(input: ValidatePromptInput): boolean {
  return input.checkInjection ?? true;
}

function resolveValidationInputs(
  input: ValidatePromptInput,
  validatedPrompt: string
): {
  targetModel: ValidationModel;
  checkInjection: boolean;
  validationPrompt: string;
} {
  const targetModel = resolveValidationModel(input);
  const checkInjection = resolveCheckInjection(input);
  const validationPrompt = buildValidationPrompt(
    validatedPrompt,
    targetModel,
    checkInjection
  );
  return { targetModel, checkInjection, validationPrompt };
}

function resolveValidatedPrompt(
  input: ValidatePromptInput
): string | ErrorResponse {
  try {
    return validatePrompt(input.prompt);
  } catch (error) {
    return createErrorResponse(error, ErrorCode.E_INVALID_INPUT, input.prompt);
  }
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
      timeoutMs: VALIDATE_TIMEOUT_MS,
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
  const context = getToolContext(extra);

  const validatedPrompt = resolveValidatedPrompt(input);
  if (typeof validatedPrompt !== 'string') return validatedPrompt;

  const { targetModel, checkInjection, validationPrompt } =
    resolveValidationInputs(input, validatedPrompt);

  try {
    const parsed = await requestValidation(
      validationPrompt,
      context.request.signal
    );
    const tokenLimit = resolveModelTokenLimit(targetModel);
    const provider = await getProviderInfo();
    return buildValidationResponse(
      parsed,
      targetModel,
      checkInjection,
      tokenLimit,
      provider
    );
  } catch (error) {
    return createErrorResponse(error, ErrorCode.E_LLM_FAILED, input.prompt);
  }
}

// Registers the validate_prompt tool with the MCP server
export function registerValidatePromptTool(server: McpServer): void {
  server.registerTool(TOOL_NAME, VALIDATE_PROMPT_TOOL, handleValidatePrompt);
}
