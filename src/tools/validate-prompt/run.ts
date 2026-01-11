import { LLM_TIMEOUT_MS, VALIDATE_MAX_TOKENS } from '../../config/constants.js';
import type {
  ValidationIssue,
  ValidationResponse,
} from '../../config/types.js';
import { ErrorCode } from '../../lib/errors.js';
import { executeLLMWithJsonResponse } from '../../lib/tool-helpers.js';
import { ValidationResponseSchema } from '../../schemas/llm-responses.js';
import { TOOL_NAME } from './constants.js';

function parseValidationResponse(response: unknown): ValidationResponse {
  const parsed = ValidationResponseSchema.parse(response);
  const issues = parsed.issues.map((issue) => {
    return {
      type: issue.type,
      message: issue.message,
      ...(issue.suggestion !== undefined
        ? { suggestion: issue.suggestion }
        : {}),
    } satisfies ValidationIssue;
  });
  return { ...parsed, issues };
}

export async function requestValidation(
  validationPrompt: string,
  signal: AbortSignal
): Promise<ValidationResponse> {
  const { value } = await executeLLMWithJsonResponse<ValidationResponse>(
    validationPrompt,
    parseValidationResponse,
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
