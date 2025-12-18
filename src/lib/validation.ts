import { MAX_PROMPT_LENGTH, MIN_PROMPT_LENGTH } from '../config/constants.js';
import {
  OPTIMIZATION_TECHNIQUES,
  type OptimizationTechnique,
  TARGET_FORMATS,
  type TargetFormat,
} from '../config/types.js';
import { ErrorCode, McpError } from './errors.js';

const VALID_TECHNIQUES_SET: ReadonlySet<string> = new Set(
  OPTIMIZATION_TECHNIQUES
);

const VALID_FORMATS_SET: ReadonlySet<string> = new Set(TARGET_FORMATS);

function isOptimizationTechnique(
  value: string
): value is OptimizationTechnique {
  return VALID_TECHNIQUES_SET.has(value);
}

function isTargetFormat(value: string): value is TargetFormat {
  return VALID_FORMATS_SET.has(value);
}

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

export function validateTechnique(technique: string): OptimizationTechnique {
  if (!isOptimizationTechnique(technique)) {
    throw new McpError(
      ErrorCode.E_INVALID_INPUT,
      `Invalid technique: "${technique}"`,
      undefined,
      {
        provided: technique,
        valid: OPTIMIZATION_TECHNIQUES,
      }
    );
  }
  return technique;
}

export function validateTechniques(
  techniques: readonly string[]
): OptimizationTechnique[] {
  if (!techniques.length) {
    throw new McpError(
      ErrorCode.E_INVALID_INPUT,
      `At least one optimization technique is required. Valid techniques: ${OPTIMIZATION_TECHNIQUES.join(', ')}`,
      undefined,
      { provided: techniques.length, validOptions: OPTIMIZATION_TECHNIQUES }
    );
  }

  if (techniques.length > 6) {
    throw new McpError(
      ErrorCode.E_INVALID_INPUT,
      'Maximum 6 techniques allowed per optimization. Consider using "comprehensive" instead.',
      undefined,
      { provided: techniques.length, maxAllowed: 6 }
    );
  }

  return techniques.map((technique) => validateTechnique(technique));
}

export function validateFormat(format: string): TargetFormat {
  if (!isTargetFormat(format)) {
    throw new McpError(
      ErrorCode.E_INVALID_INPUT,
      `Invalid format: "${format}"`,
      undefined,
      {
        provided: format,
        valid: TARGET_FORMATS,
      }
    );
  }
  return format;
}

export function validateLLMOutput(output: string, maxLength = 15000): string {
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
