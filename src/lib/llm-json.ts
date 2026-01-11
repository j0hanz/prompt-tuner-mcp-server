import {
  LLM_ERROR_PREVIEW_CHARS,
  LLM_MAX_RESPONSE_LENGTH,
} from '../config/constants.js';
import type { ErrorCodeType } from '../config/types.js';
import { logger, McpError } from './errors.js';
import { stripCodeBlockMarkers } from './llm-json/fences.js';
import { extractFirstJsonFragment } from './llm-json/scan.js';

interface ParseFailureDetail {
  stage: string;
  message: string;
}

type ParseAttempt<T> =
  | { success: true; value: T }
  | { success: false; error: ParseFailureDetail };

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
