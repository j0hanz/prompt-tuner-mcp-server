import {
  LLM_ERROR_PREVIEW_CHARS,
  LLM_MAX_RESPONSE_LENGTH,
} from '../config/constants.js';
import type { ErrorCodeType } from '../config/types.js';
import { logger, McpError } from './errors.js';
import { extractFirstJsonFragment } from './llm-json/scan.js';

const CODE_FENCE = '```';

interface ParseFailureDetail {
  stage: string;
  message: string;
}

type ParseAttempt<T> =
  | { success: true; value: T }
  | { success: false; error: ParseFailureDetail };

function isWhitespace(char: string): boolean {
  return char.trim() === '';
}

function stripStartFence(text: string): string {
  let cursor = 0;
  while (cursor < text.length && isWhitespace(text.charAt(cursor))) {
    cursor += 1;
  }
  if (!text.startsWith(CODE_FENCE, cursor)) return text;
  let index = cursor + CODE_FENCE.length;

  if (index < text.length && !isWhitespace(text.charAt(index))) {
    let tokenEnd = index;
    while (tokenEnd < text.length && !isWhitespace(text.charAt(tokenEnd))) {
      tokenEnd += 1;
    }
    const token = text.slice(index, tokenEnd);
    if (token.toLowerCase() !== 'json') return text;
    index = tokenEnd;
  }

  while (index < text.length && isWhitespace(text.charAt(index))) {
    index += 1;
  }

  return text.slice(index);
}

function stripEndFence(text: string): string {
  let end = text.length - 1;
  while (end >= 0 && isWhitespace(text.charAt(end))) {
    end -= 1;
  }
  if (end < CODE_FENCE.length - 1) return text;
  const fenceStart = end - (CODE_FENCE.length - 1);
  if (text.slice(fenceStart, end + 1) !== CODE_FENCE) return text;
  return text.slice(0, fenceStart);
}

function stripCodeBlockMarkers(text: string): string {
  const withoutStart = stripStartFence(text);
  const withoutEnd = stripEndFence(withoutStart);
  return withoutEnd.trim();
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
    const message = error instanceof Error ? error.message : String(error);
    logger.debug(
      `${debugLabel ?? 'JSON parse'}: ${stageLabel} parse failed: ${message}`
    );
    return { success: false, error: { stage: stageLabel, message } };
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
  maxPreviewChars: number,
  failureDetail?: ParseFailureDetail | null
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
      ...(failureDetail
        ? {
            parseErrorStage: failureDetail.stage,
            parseErrorMessage: failureDetail.message,
          }
        : {}),
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
  const resolved: {
    errorCode: ErrorCodeType;
    maxPreviewChars: number;
    maxInputLength: number;
    debugLabel?: string;
  } = {
    errorCode: options.errorCode,
    maxPreviewChars: options.maxPreviewChars ?? LLM_ERROR_PREVIEW_CHARS,
    maxInputLength: options.maxInputLength ?? LLM_MAX_RESPONSE_LENGTH,
  };

  if (options.debugLabel !== undefined) {
    resolved.debugLabel = options.debugLabel;
  }

  return resolved;
}

function shouldTryRawParse(text: string): boolean {
  if (text.startsWith('```')) return false;
  const firstChar = text[0];
  return firstChar === '{' || firstChar === '[';
}

function parseJsonCandidates<T>(
  text: string,
  parse: (value: unknown) => T,
  debugLabel: string | undefined
): { value: T } | { error: ParseFailureDetail | null } {
  const rawCandidates: { label: string; value: string | null }[] = [
    { label: 'raw', value: shouldTryRawParse(text) ? text : null },
  ];
  const initial = parseCandidates(rawCandidates, parse, debugLabel);
  if ('value' in initial) return initial;

  const stripped = stripCodeBlockMarkers(text);
  const fallbackCandidates: { label: string; value: string | null }[] = [];
  if (stripped !== text) {
    fallbackCandidates.push({ label: 'stripped markers', value: stripped });
  }
  fallbackCandidates.push({
    label: 'extracted fragment',
    value: extractFirstJsonFragment(text),
  });

  return parseCandidates(fallbackCandidates, parse, debugLabel);
}

function parseCandidates<T>(
  candidates: { label: string; value: string | null }[],
  parse: (value: unknown) => T,
  debugLabel: string | undefined
): { value: T } | { error: ParseFailureDetail | null } {
  let lastError: ParseFailureDetail | null = null;
  for (const candidate of candidates) {
    if (!candidate.value) continue;
    const attempt = tryParseJson(
      candidate.value,
      parse,
      debugLabel,
      candidate.label
    );
    if (attempt.success) return { value: attempt.value };
    lastError = attempt.error;
  }
  return { error: lastError };
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
  if ('value' in parsed) return parsed.value;

  return throwParseFailure(
    parseOptions,
    llmResponseText,
    parseOptions.maxPreviewChars,
    parsed.error
  );
}
