// Shared utilities for parsing JSON from LLM responses
// Handles common wrapping patterns like ```json code blocks``` and surrounding text.
import {
  LLM_ERROR_PREVIEW_CHARS,
  LLM_MAX_RESPONSE_LENGTH,
} from '../config/constants.js';
import type { ErrorCodeType } from '../config/types.js';
import { logger, McpError } from './errors.js';

// Matches opening code block: ```json or ``` at start (with optional whitespace/newlines before)
const CODE_BLOCK_START_RE = /^[\s\n]*```(?:json)?[\s\n]*/i;
// Matches closing code block at end (with optional whitespace/newlines after)
const CODE_BLOCK_END_RE = /[\s\n]*```[\s\n]*$/;

// Strips code block markers from the start and end of a string
function stripCodeBlockMarkers(text: string): string {
  let result = text;

  // Remove opening code block marker
  const startMatch = CODE_BLOCK_START_RE.exec(result);
  if (startMatch) {
    result = result.slice(startMatch[0].length);
  }

  // Remove closing code block marker
  const endMatch = CODE_BLOCK_END_RE.exec(result);
  if (endMatch) {
    result = result.slice(0, result.length - endMatch[0].length);
  }

  return result.trim();
}

export function parseJsonFromLlmResponse<T>(
  llmResponseText: string,
  parse: (value: unknown) => T,
  options: {
    errorCode: ErrorCodeType;
    maxPreviewChars?: number;
    maxInputLength?: number;
    debugLabel?: string;
  }
): T {
  // Input validation: prevent DoS attacks with excessively large responses
  const maxInputLength = options.maxInputLength ?? LLM_MAX_RESPONSE_LENGTH;

  if (llmResponseText.length > maxInputLength) {
    throw new McpError(
      options.errorCode,
      `LLM response too large: ${llmResponseText.length} chars (max: ${maxInputLength})`,
      undefined,
      { responseLength: llmResponseText.length, maxLength: maxInputLength }
    );
  }

  const jsonStr = llmResponseText.trim();
  const maxPreviewChars = options.maxPreviewChars ?? LLM_ERROR_PREVIEW_CHARS;

  // Try raw parse first
  try {
    const parsed: unknown = JSON.parse(jsonStr);
    const result = parse(parsed);
    if (options.debugLabel) {
      logger.debug(`${options.debugLabel}: parsed JSON successfully (raw)`);
    }
    return result;
  } catch (error) {
    logger.debug(
      `${options.debugLabel ?? 'JSON parse'}: raw parse failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Try with code block markers stripped
  try {
    const stripped = stripCodeBlockMarkers(jsonStr);
    const parsed: unknown = JSON.parse(stripped);
    const result = parse(parsed);
    if (options.debugLabel) {
      logger.debug(
        `${options.debugLabel}: parsed JSON successfully (stripped markers)`
      );
    }
    return result;
  } catch (error) {
    logger.debug(
      `${options.debugLabel ?? 'JSON parse'}: stripped parse failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Both strategies failed - throw error with helpful context
  const debugEnabled = process.env.DEBUG === 'true';
  const contextLabel = options.debugLabel ?? 'LLM response';
  if (debugEnabled) {
    logger.debug(
      { preview: llmResponseText.slice(0, maxPreviewChars) },
      `${contextLabel}: raw response preview`
    );
  }

  throw new McpError(
    options.errorCode,
    `Failed to parse ${contextLabel} as JSON`,
    undefined,
    {
      strategiesAttempted: ['raw', 'codeblock-stripped'],
    }
  );
}
