// Shared utilities for parsing JSON from LLM responses
// Handles common wrapping patterns like ```json code blocks``` and surrounding text.
import {
  LLM_ERROR_PREVIEW_CHARS,
  LLM_MAX_RESPONSE_LENGTH,
} from '../config/constants.js';
import type { ErrorCodeType } from '../config/types.js';
import { logger, McpError } from './errors.js';
import { extractFirstJsonFragment } from './llm-json/scan.js';

// Matches opening code block: ```json or ``` at start (with optional whitespace/newlines before)
const CODE_BLOCK_START_RE = /^[\s\n]*```(?:json)?[\s\n]*/i;
// Matches closing code block at end (with optional whitespace/newlines after)
const CODE_BLOCK_END_RE = /[\s\n]*```[\s\n]*$/;

type ParseAttempt<T> =
  | { success: true; value: T }
  | { success: false; error: unknown };

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

function enforceMaxInputLength(
  llmResponseText: string,
  maxInputLength: number,
  errorCode: ErrorCodeType
): void {
  if (llmResponseText.length <= maxInputLength) return;

  throw new McpError(
    errorCode,
    `LLM response too large: ${llmResponseText.length} chars (max: ${maxInputLength})`,
    undefined,
    { responseLength: llmResponseText.length, maxLength: maxInputLength }
  );
}

function tryParseJson<T>(
  jsonText: string,
  parse: (value: unknown) => T,
  debugLabel: string | undefined,
  stageLabel: string
): ParseAttempt<T> {
  try {
    const parsed: unknown = JSON.parse(jsonText);
    const result = parse(parsed);
    if (debugLabel) {
      logger.debug(`${debugLabel}: parsed JSON successfully (${stageLabel})`);
    }
    return { success: true, value: result };
  } catch (error) {
    logger.debug(
      `${debugLabel ?? 'JSON parse'}: ${stageLabel} parse failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return { success: false, error };
  }
}

function logPreviewIfDebug(
  llmResponseText: string,
  maxPreviewChars: number,
  contextLabel: string
): void {
  if (process.env.DEBUG !== 'true') return;
  logger.debug(
    { preview: llmResponseText.slice(0, maxPreviewChars) },
    `${contextLabel}: raw response preview`
  );
}

function throwParseFailure(
  options: {
    errorCode: ErrorCodeType;
    debugLabel?: string;
  },
  llmResponseText: string,
  maxPreviewChars: number
): never {
  const contextLabel = options.debugLabel ?? 'LLM response';
  logPreviewIfDebug(llmResponseText, maxPreviewChars, contextLabel);
  throw new McpError(
    options.errorCode,
    `Failed to parse ${contextLabel} as JSON`,
    undefined,
    {
      strategiesAttempted: ['raw', 'codeblock-stripped', 'extracted-json'],
      parseFailed: true,
    }
  );
}

function resolveParseOptions(options: {
  errorCode: ErrorCodeType;
  maxPreviewChars?: number;
  maxInputLength?: number;
  debugLabel?: string;
}): {
  errorCode: ErrorCodeType;
  maxPreviewChars: number;
  maxInputLength: number;
  debugLabel?: string;
} {
  return {
    errorCode: options.errorCode,
    maxPreviewChars: options.maxPreviewChars ?? LLM_ERROR_PREVIEW_CHARS,
    maxInputLength: options.maxInputLength ?? LLM_MAX_RESPONSE_LENGTH,
    debugLabel: options.debugLabel,
  };
}

function isJsonStart(text: string): boolean {
  const firstChar = text[0];
  return firstChar === '{' || firstChar === '[';
}

function shouldTryRawParse(text: string): boolean {
  return !text.startsWith('```') && isJsonStart(text);
}

function attemptParse<T>(
  payload: string,
  label: string,
  parse: (value: unknown) => T,
  debugLabel: string | undefined
): T | null {
  const attempt = tryParseJson(payload, parse, debugLabel, label);
  return attempt.success ? attempt.value : null;
}

function parseRawCandidate<T>(
  text: string,
  parse: (value: unknown) => T,
  debugLabel: string | undefined
): T | null {
  if (!shouldTryRawParse(text)) return null;
  return attemptParse(text, 'raw', parse, debugLabel);
}

function parseStrippedCandidate<T>(
  text: string,
  parse: (value: unknown) => T,
  debugLabel: string | undefined
): T | null {
  const stripped = stripCodeBlockMarkers(text);
  if (shouldTryRawParse(text) && stripped === text) return null;
  return attemptParse(stripped, 'stripped markers', parse, debugLabel);
}

function parseExtractedCandidate<T>(
  text: string,
  parse: (value: unknown) => T,
  debugLabel: string | undefined
): T | null {
  const extracted = extractFirstJsonFragment(text);
  if (!extracted) return null;
  return attemptParse(extracted, 'extracted fragment', parse, debugLabel);
}

function parseJsonCandidates<T>(
  text: string,
  parse: (value: unknown) => T,
  debugLabel: string | undefined
): T | null {
  return (
    parseRawCandidate(text, parse, debugLabel) ??
    parseStrippedCandidate(text, parse, debugLabel) ??
    parseExtractedCandidate(text, parse, debugLabel)
  );
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
  const parseOptions = resolveParseOptions(options);
  enforceMaxInputLength(
    llmResponseText,
    parseOptions.maxInputLength,
    parseOptions.errorCode
  );

  const jsonStr = llmResponseText.trim();
  const parsed = parseJsonCandidates(jsonStr, parse, parseOptions.debugLabel);
  if (parsed !== null) return parsed;

  return throwParseFailure(
    parseOptions,
    llmResponseText,
    parseOptions.maxPreviewChars
  );
}
