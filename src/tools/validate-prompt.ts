// Validate Prompt Tool - LLM-powered validation
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ValidationIssue, ValidationResponse } from '../config/types.js';
import {
  createErrorResponse,
  createSuccessResponse,
  ErrorCode,
} from '../lib/errors.js';
import { executeLLMWithJsonResponse } from '../lib/tool-helpers.js';
import { validatePrompt } from '../lib/validation.js';
import {
  ValidatePromptInputSchema,
  ValidatePromptOutputSchema,
} from '../schemas/index.js';
import { ValidationResponseSchema } from '../schemas/llm-responses.js';

const VALIDATION_SYSTEM_PROMPT = `You are an expert prompt validator. Check prompts for issues, estimate tokens, and detect security risks.

<validation_checks>
1. **Anti-patterns**: Vague language, missing context, overly long sentences
2. **Token limits**: Estimate tokens (1 token ≈ 4 chars), check against model limits
3. **Security**: Prompt injection patterns, script injection
4. **Typos**: Common misspellings
5. **Quality**: Role definition, output format, examples
</validation_checks>

<model_limits>
- claude: 200,000 tokens
- gpt: 128,000 tokens
- gemini: 1,000,000 tokens
- generic: 8,000 tokens
</model_limits>

<output_format>
Return JSON:
{
  "isValid": boolean,
  "tokenEstimate": number,
  "issues": [
    {
      "type": "error" | "warning" | "info",
      "message": string,
      "suggestion": string
    }
  ]
}
</output_format>`;

// Formats a validation issue as markdown
function formatIssue(issue: ValidationIssue): string {
  return `- ${issue.message}\n  💡 ${issue.suggestion ?? 'N/A'}`;
}

interface ValidatePromptInput {
  prompt: string;
  targetModel?: string;
  checkInjection?: boolean;
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
    openWorldHint: false,
  },
};

function buildValidationHeader(
  parsed: ValidationResponse,
  targetModel: string
): string[] {
  return [
    '# Prompt Validation',
    '',
    `**Status**: ${parsed.isValid ? '✅ Valid' : '❌ Invalid'}`,
    `**Token Estimate**: ~${parsed.tokenEstimate} tokens`,
    `**Target Model**: ${targetModel}`,
    '',
  ];
}

function appendIssueSection(
  sections: string[],
  title: string,
  issues: ValidationIssue[]
): void {
  if (issues.length === 0) return;
  sections.push(title, issues.map(formatIssue).join('\n'), '');
}

function formatValidationOutput(
  parsed: ValidationResponse,
  targetModel: string
): string {
  const errors = parsed.issues.filter((i) => i.type === 'error');
  const warnings = parsed.issues.filter((i) => i.type === 'warning');
  const infos = parsed.issues.filter((i) => i.type === 'info');

  const sections = buildValidationHeader(parsed, targetModel);
  appendIssueSection(sections, `## ❌ Errors (${errors.length})`, errors);
  appendIssueSection(sections, `## ⚠️ Warnings (${warnings.length})`, warnings);
  appendIssueSection(sections, `## ℹ️ Info (${infos.length})`, infos);

  sections.push(
    '',
    parsed.isValid
      ? '✅ Prompt is ready to use!'
      : '❌ Fix errors before using this prompt.'
  );
  return sections.join('\n');
}

function hasInjectionError(parsed: ValidationResponse): boolean {
  return parsed.issues
    .filter((issue) => issue.type === 'error')
    .some((issue) => issue.message.includes('injection'));
}

function resolveTargetModel(input: ValidatePromptInput): string {
  return input.targetModel ?? 'generic';
}

function resolveCheckInjection(input: ValidatePromptInput): boolean {
  return input.checkInjection ?? true;
}

function buildValidationPrompt(
  validatedPrompt: string,
  targetModel: string,
  checkInjection: boolean
): string {
  return `${VALIDATION_SYSTEM_PROMPT}\n\nTarget Model: ${targetModel}\nCheck Injection: ${String(checkInjection)}\n\nPROMPT TO VALIDATE:\n${validatedPrompt}`;
}

function buildSecurityFlags(
  parsed: ValidationResponse,
  checkInjection: boolean
): string[] {
  return checkInjection && hasInjectionError(parsed)
    ? ['injection_detected']
    : [];
}

function buildValidationResponse(
  parsed: ValidationResponse,
  targetModel: string,
  checkInjection: boolean
): ReturnType<typeof createSuccessResponse> {
  const output = formatValidationOutput(parsed, targetModel);
  const securityFlags = buildSecurityFlags(parsed, checkInjection);

  return createSuccessResponse(output, {
    ok: true,
    isValid: parsed.isValid,
    issues: parsed.issues,
    tokenEstimate: parsed.tokenEstimate,
    securityFlags,
  });
}

async function handleValidatePrompt(
  input: ValidatePromptInput
): Promise<
  | ReturnType<typeof createSuccessResponse>
  | ReturnType<typeof createErrorResponse>
> {
  let validatedPrompt: string;
  try {
    validatedPrompt = validatePrompt(input.prompt);
  } catch (error) {
    return createErrorResponse(error, ErrorCode.E_INVALID_INPUT, input.prompt);
  }

  const targetModel = resolveTargetModel(input);
  const checkInjection = resolveCheckInjection(input);
  const validationPrompt = buildValidationPrompt(
    validatedPrompt,
    targetModel,
    checkInjection
  );

  try {
    const parsed = await executeLLMWithJsonResponse<ValidationResponse>(
      validationPrompt,
      (value) => ValidationResponseSchema.parse(value),
      ErrorCode.E_LLM_FAILED,
      'validate_prompt',
      { maxTokens: 1000 }
    );

    return buildValidationResponse(parsed, targetModel, checkInjection);
  } catch (error) {
    return createErrorResponse(error, ErrorCode.E_LLM_FAILED, input.prompt);
  }
}

// Registers the validate_prompt tool with the MCP server
export function registerValidatePromptTool(server: McpServer): void {
  server.registerTool(
    'validate_prompt',
    VALIDATE_PROMPT_TOOL,
    handleValidatePrompt
  );
}
