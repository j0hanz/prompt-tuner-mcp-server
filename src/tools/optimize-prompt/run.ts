import { LLM_TIMEOUT_MS, OPTIMIZE_MAX_TOKENS } from '../../config/constants.js';
import type { OptimizeResponse } from '../../config/types.js';
import { ErrorCode, McpError } from '../../lib/errors.js';
import { executeLLMWithJsonResponse } from '../../lib/llm-tool-execution.js';
import { OptimizeResponseSchema } from '../../schemas/llm-responses.js';
import { STRICT_OPTIMIZE_RULES, TOOL_NAME } from './constants.js';
import { buildOptimizePrompt } from './prompt.js';
import type {
  OptimizeValidationConfig,
  ResolvedOptimizeInputs,
} from './types.js';
import { validateOptimizeResult } from './validation.js';

function createTimeoutBudget(
  label: string,
  totalTimeoutMs: number
): () => number {
  const deadlineMs = Date.now() + totalTimeoutMs;
  return () => {
    const remaining = deadlineMs - Date.now();
    if (remaining <= 0) {
      throw new McpError(ErrorCode.E_TIMEOUT, `${label} budget exceeded`);
    }
    return remaining;
  };
}

async function runOptimization(
  optimizePrompt: string,
  signal: AbortSignal,
  timeoutMs: number
): Promise<{ result: OptimizeResponse; usedFallback: boolean }> {
  const { value, usedFallback } =
    await executeLLMWithJsonResponse<OptimizeResponse>(
      optimizePrompt,
      (response) => OptimizeResponseSchema.parse(response),
      ErrorCode.E_LLM_FAILED,
      TOOL_NAME,
      {
        maxTokens: OPTIMIZE_MAX_TOKENS,
        timeoutMs,
        signal,
        retryOnParseFailure: true,
      }
    );
  return { result: value, usedFallback };
}

async function optimizeOnce(
  resolved: ResolvedOptimizeInputs,
  signal: AbortSignal,
  timeoutMs: number,
  extraRules?: string
): Promise<{ result: OptimizeResponse; usedFallback: boolean }> {
  const optimizePrompt = buildOptimizePrompt(
    resolved.validatedPrompt,
    resolved.resolvedFormat,
    resolved.effectiveTechniques,
    extraRules
  );
  return runOptimization(optimizePrompt, signal, timeoutMs);
}

function buildOptimizeValidationConfig(
  resolved: ResolvedOptimizeInputs
): OptimizeValidationConfig {
  return {
    allowedTechniques: resolved.effectiveTechniques,
    targetFormat: resolved.resolvedFormat,
  };
}

function throwOptimizationFailure(reason?: string): never {
  const suffix = reason ? `: ${reason}` : '';
  throw new McpError(
    ErrorCode.E_LLM_FAILED,
    `Optimized prompt failed validation${suffix}`
  );
}

function buildAttemptResult(
  attempt: { result: OptimizeResponse; usedFallback: boolean },
  validation: ReturnType<typeof validateOptimizeResult>
):
  | { ok: true; result: OptimizeResponse; usedFallback: boolean }
  | {
      ok: false;
      result: OptimizeResponse;
      usedFallback: boolean;
      reason?: string;
    } {
  if (validation.ok) {
    return {
      ok: true,
      result: validation.result,
      usedFallback: attempt.usedFallback,
    };
  }
  return {
    ok: false,
    result: validation.result,
    usedFallback: attempt.usedFallback,
    ...(validation.reason !== undefined ? { reason: validation.reason } : {}),
  };
}

async function runOptimizationAttempt(
  resolved: ResolvedOptimizeInputs,
  signal: AbortSignal,
  timeoutMs: number,
  config: OptimizeValidationConfig,
  extraRules?: string
): Promise<
  | { ok: true; result: OptimizeResponse; usedFallback: boolean }
  | {
      ok: false;
      result: OptimizeResponse;
      usedFallback: boolean;
      reason?: string;
    }
> {
  const attempt = await optimizeOnce(resolved, signal, timeoutMs, extraRules);
  const validation = validateOptimizeResult(attempt.result, config);
  return buildAttemptResult(attempt, validation);
}

interface OptimizationAttemptContext {
  resolved: ResolvedOptimizeInputs;
  signal: AbortSignal;
  resolveRemainingTimeout: () => number;
  validationConfig: OptimizeValidationConfig;
}

function buildOptimizationContext(
  resolved: ResolvedOptimizeInputs,
  signal: AbortSignal,
  validationConfig: OptimizeValidationConfig
): OptimizationAttemptContext {
  return {
    resolved,
    signal,
    resolveRemainingTimeout: createTimeoutBudget(
      'Optimization',
      LLM_TIMEOUT_MS
    ),
    validationConfig,
  };
}

async function runPrimaryAttempt(context: OptimizationAttemptContext): Promise<
  | { ok: true; result: OptimizeResponse; usedFallback: boolean }
  | {
      ok: false;
      result: OptimizeResponse;
      usedFallback: boolean;
      reason?: string;
    }
> {
  return runOptimizationAttempt(
    context.resolved,
    context.signal,
    context.resolveRemainingTimeout(),
    context.validationConfig
  );
}

async function runRetryAttempt(context: OptimizationAttemptContext): Promise<
  | { ok: true; result: OptimizeResponse; usedFallback: boolean }
  | {
      ok: false;
      result: OptimizeResponse;
      usedFallback: boolean;
      reason?: string;
    }
> {
  return runOptimizationAttempt(
    context.resolved,
    context.signal,
    context.resolveRemainingTimeout(),
    context.validationConfig,
    STRICT_OPTIMIZE_RULES
  );
}

async function executeOptimizationPlan(
  resolved: ResolvedOptimizeInputs,
  signal: AbortSignal
): Promise<{ result: OptimizeResponse; usedFallback: boolean }> {
  const validationConfig = buildOptimizeValidationConfig(resolved);
  const context = buildOptimizationContext(resolved, signal, validationConfig);
  const primary = await runPrimaryAttempt(context);
  if (primary.ok) {
    return {
      result: primary.result,
      usedFallback: primary.usedFallback,
    };
  }
  const retry = await runRetryAttempt(context);
  if (!retry.ok) {
    throwOptimizationFailure(retry.reason);
  }
  return { result: retry.result, usedFallback: true };
}

export async function runValidatedOptimization(
  resolved: ResolvedOptimizeInputs,
  signal: AbortSignal
): Promise<{ result: OptimizeResponse; usedFallback: boolean }> {
  return executeOptimizationPlan(resolved, signal);
}
