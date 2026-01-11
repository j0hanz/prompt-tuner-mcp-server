import type {
  ProviderInfo,
  ValidationIssue,
  ValidationResponse,
} from '../../config/types.js';
import { createSuccessResponse } from '../../lib/errors.js';
import { INJECTION_TERMS } from './constants.js';
import { formatValidationOutput } from './formatters.js';
import type { ValidationModel } from './types.js';

function issueMentionsInjection(issue: ValidationIssue): boolean {
  const text = `${issue.message} ${issue.suggestion ?? ''}`.toLowerCase();
  return INJECTION_TERMS.some((keyword) => text.includes(keyword));
}

function buildSecurityFlags(
  issues: readonly ValidationIssue[],
  checkInjection: boolean
): string[] {
  if (!checkInjection) return [];
  return issues.some(issueMentionsInjection) ? ['injection_detected'] : [];
}

function buildValidationPayload(
  parsed: ValidationResponse,
  targetModel: ValidationModel,
  tokenLimit: number,
  provider: ProviderInfo,
  securityFlags: string[]
): Record<string, unknown> {
  const tokenUtilization = Math.round(
    (parsed.tokenEstimate / tokenLimit) * 100
  );
  const overLimit = parsed.tokenEstimate > tokenLimit;
  return {
    ok: true,
    isValid: parsed.isValid,
    issues: parsed.issues,
    tokenEstimate: parsed.tokenEstimate,
    tokenLimit,
    tokenUtilization,
    overLimit,
    targetModel,
    securityFlags,
    provider: provider.provider,
    model: provider.model,
  };
}

export function buildValidationResponse(
  parsed: ValidationResponse,
  targetModel: ValidationModel,
  tokenLimit: number,
  checkInjection: boolean,
  provider: ProviderInfo
): ReturnType<typeof createSuccessResponse> {
  const output = formatValidationOutput(
    parsed,
    targetModel,
    tokenLimit,
    provider
  );
  const securityFlags = buildSecurityFlags(parsed.issues, checkInjection);
  const structured = buildValidationPayload(
    parsed,
    targetModel,
    tokenLimit,
    provider,
    securityFlags
  );
  return createSuccessResponse(output, structured);
}
