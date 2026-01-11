import { performance } from 'node:perf_hooks';

import type { ErrorCodeType, LLMProvider } from '../config/types.js';
import { McpError } from './errors.js';
import { publishLlmRequest } from './telemetry.js';

interface RunFailureDetails {
  errorCode?: ErrorCodeType;
  status?: number;
}

export function resolveFailureDetails(error: unknown): RunFailureDetails {
  if (!(error instanceof McpError)) return {};
  const status =
    typeof error.details?.status === 'number'
      ? error.details.status
      : undefined;
  const details: RunFailureDetails = { errorCode: error.code };
  if (status !== undefined) {
    details.status = status;
  }
  return details;
}

export function publishSuccessEvent(
  provider: LLMProvider,
  model: string,
  attempts: number,
  startPerf: number
): void {
  publishLlmRequest({
    provider,
    model,
    attempts,
    durationMs: performance.now() - startPerf,
    ok: true,
  });
}

export function publishFailureEvent(
  provider: LLMProvider,
  model: string,
  attempts: number,
  startPerf: number,
  details: RunFailureDetails
): void {
  publishLlmRequest({
    provider,
    model,
    attempts,
    durationMs: performance.now() - startPerf,
    ok: false,
    ...(details.errorCode !== undefined
      ? { errorCode: details.errorCode }
      : {}),
    ...(details.status !== undefined ? { status: details.status } : {}),
  });
}
