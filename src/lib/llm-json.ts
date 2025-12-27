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

type JsonBracket = '{' | '}' | '[' | ']';

function isOpeningBracket(value: string): value is '{' | '[' {
  return value === '{' || value === '[';
}

function isClosingBracket(value: string): value is '}' | ']' {
  return value === '}' || value === ']';
}

function matchesBracket(open: '{' | '[', close: '}' | ']'): boolean {
  return (open === '{' && close === '}') || (open === '[' && close === ']');
}

function extractFirstJsonFragment(text: string): string | null {
  let startIndex = -1;
  const stack: ('{' | '[')[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] as JsonBracket | '"' | '\\';

    if (startIndex === -1) {
      if (isOpeningBracket(char)) {
        startIndex = i;
        stack.push(char);
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (isOpeningBracket(char)) {
      stack.push(char);
      continue;
    }

    if (isClosingBracket(char)) {
      const last = stack[stack.length - 1];
      if (last && matchesBracket(last, char)) {
        stack.pop();
        if (stack.length === 0) {
          return text.slice(startIndex, i + 1).trim();
        }
      }
    }
  }

  return null;
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
  enforceMaxInputLength(llmResponseText, maxInputLength, options.errorCode);

  const jsonStr = llmResponseText.trim();
  const maxPreviewChars = options.maxPreviewChars ?? LLM_ERROR_PREVIEW_CHARS;
  const startsWithCodeFence = jsonStr.startsWith('```');
  const firstChar = jsonStr[0];
  const looksLikeJson = firstChar === '{' || firstChar === '[';

  // Try raw parse first
  if (!startsWithCodeFence && looksLikeJson) {
    const rawAttempt = tryParseJson(jsonStr, parse, options.debugLabel, 'raw');
    if (rawAttempt.success) return rawAttempt.value;
  }

  // Try with code block markers stripped
  const stripped = stripCodeBlockMarkers(jsonStr);
  const strippedAttempt = tryParseJson(
    stripped,
    parse,
    options.debugLabel,
    'stripped markers'
  );
  if (strippedAttempt.success) return strippedAttempt.value;

  const extracted = extractFirstJsonFragment(jsonStr);
  if (extracted) {
    const extractedAttempt = tryParseJson(
      extracted,
      parse,
      options.debugLabel,
      'extracted fragment'
    );
    if (extractedAttempt.success) return extractedAttempt.value;
  }
  return throwParseFailure(options, llmResponseText, maxPreviewChars);
}
