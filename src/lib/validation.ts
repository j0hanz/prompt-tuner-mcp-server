import {
  LLM_MAX_RESPONSE_LENGTH,
  MAX_PROMPT_LENGTH,
  MIN_PROMPT_LENGTH,
} from '../config/constants.js';
import { ErrorCode, McpError } from './errors.js';

export function validatePrompt(prompt: string): string {
  if (prompt.length > MAX_PROMPT_LENGTH * 2) {
    throw new McpError(
      ErrorCode.E_INVALID_INPUT,
      `Prompt with excessive whitespace rejected (${prompt.length} characters). Maximum allowed: ${MAX_PROMPT_LENGTH * 2}`,
      undefined,
      { providedLength: prompt.length, maxAllowed: MAX_PROMPT_LENGTH * 2 }
    );
  }

  const trimmed = prompt.trim();

  if (trimmed.length < MIN_PROMPT_LENGTH) {
    throw new McpError(
      ErrorCode.E_INVALID_INPUT,
      'Prompt is empty or contains only whitespace. Please provide a valid prompt.',
      undefined,
      { providedLength: trimmed.length, minRequired: MIN_PROMPT_LENGTH }
    );
  }

  if (trimmed.length > MAX_PROMPT_LENGTH) {
    throw new McpError(
      ErrorCode.E_INVALID_INPUT,
      `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters (${trimmed.length} provided). Please shorten your prompt.`,
      undefined,
      { providedLength: trimmed.length, maxAllowed: MAX_PROMPT_LENGTH }
    );
  }

  return trimmed;
}

export function validateLLMOutput(
  output: string,
  maxLength = LLM_MAX_RESPONSE_LENGTH
): string {
  if (output.length > maxLength) {
    throw new McpError(
      ErrorCode.E_INVALID_INPUT,
      `LLM output exceeds maximum safe length of ${maxLength} characters`,
      undefined,
      { outputLength: output.length, maxAllowed: maxLength }
    );
  }

  return output;
}
