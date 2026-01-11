import { LLM_TIMEOUT_MS, REFINE_MAX_TOKENS } from '../../config/constants.js';
import type { OptimizationTechnique } from '../../config/types.js';
import { ErrorCode, McpError } from '../../lib/errors.js';
import { refineLLM } from '../../lib/llm.js';
import { normalizePromptText } from '../../lib/output-validation.js';
import { buildRefinementPlan } from './plan.js';
import type { RefinementAttemptPlan, ResolvedRefineInputs } from './types.js';
import { validateRefinedOutput } from './validation.js';

async function runRefinementAttempt(
  input: ResolvedRefineInputs,
  attempt: RefinementAttemptPlan,
  signal: AbortSignal,
  timeoutMs: number
): Promise<{
  refined: string;
  reason: string | null;
  techniqueUsed: OptimizationTechnique;
  usedFallback: boolean;
}> {
  const refinedRaw = await requestRefinement(input, attempt, signal, timeoutMs);
  const { normalized, reason } = normalizeAndValidateRefinement(
    refinedRaw,
    attempt,
    input
  );
  return {
    refined: normalized,
    reason,
    techniqueUsed: attempt.technique,
    usedFallback: attempt.usedFallback,
  };
}

async function requestRefinement(
  input: ResolvedRefineInputs,
  attempt: RefinementAttemptPlan,
  signal: AbortSignal,
  timeoutMs: number
): Promise<string> {
  return refineLLM(
    input.validatedPrompt,
    attempt.technique,
    input.resolvedFormat,
    REFINE_MAX_TOKENS,
    timeoutMs,
    signal,
    attempt.extraInstructions
  );
}

function normalizeAndValidateRefinement(
  refinedRaw: string,
  attempt: RefinementAttemptPlan,
  input: ResolvedRefineInputs
): { normalized: string; reason: string | null } {
  const normalized = normalizePromptText(refinedRaw);
  const reason = validateRefinedOutput(
    normalized,
    attempt.technique,
    input.resolvedFormat
  );
  return { normalized, reason };
}

function resolveRemainingTimeout(deadlineMs: number): number {
  const remaining = deadlineMs - Date.now();
  if (remaining <= 0) {
    throw new McpError(ErrorCode.E_TIMEOUT, 'Refinement budget exceeded');
  }
  return remaining;
}

function buildPlanResult(result: {
  refined: string;
  techniqueUsed: OptimizationTechnique;
  usedFallback: boolean;
}): {
  refined: string;
  techniqueUsed: OptimizationTechnique;
  usedFallback: boolean;
} {
  return {
    refined: result.refined,
    techniqueUsed: result.techniqueUsed,
    usedFallback: result.usedFallback,
  };
}

function throwRefinementFailure(lastReason: string | null): never {
  const reasonSuffix = lastReason ? `: ${lastReason}` : '';
  throw new McpError(
    ErrorCode.E_LLM_FAILED,
    `Refined prompt failed validation${reasonSuffix}`
  );
}

async function executeRefinementPlan(
  input: ResolvedRefineInputs,
  plan: readonly RefinementAttemptPlan[],
  signal: AbortSignal,
  deadlineMs: number
): Promise<{
  refined: string;
  techniqueUsed: OptimizationTechnique;
  usedFallback: boolean;
}> {
  let lastReason: string | null = null;
  for (const attempt of plan) {
    const remainingMs = resolveRemainingTimeout(deadlineMs);
    const result = await runRefinementAttempt(
      input,
      attempt,
      signal,
      remainingMs
    );

    if (!result.reason) {
      return buildPlanResult(result);
    }

    lastReason = result.reason;
  }

  throwRefinementFailure(lastReason);
}

export async function refineWithLLM(
  input: ResolvedRefineInputs,
  signal: AbortSignal
): Promise<{
  refined: string;
  corrections: string[];
  techniqueUsed: OptimizationTechnique;
  usedFallback: boolean;
}> {
  const plan = buildRefinementPlan(input.validatedTechnique);
  const deadlineMs = Date.now() + LLM_TIMEOUT_MS;
  const result = await executeRefinementPlan(input, plan, signal, deadlineMs);
  const corrections = buildCorrections(input.validatedPrompt, result.refined);
  return {
    refined: result.refined,
    corrections,
    techniqueUsed: result.techniqueUsed,
    usedFallback: result.usedFallback,
  };
}

function buildCorrections(original: string, refined: string): string[] {
  if (refined === original) {
    return ['No changes needed - prompt is already well-formed'];
  }

  const corrections = ['Applied LLM refinement'];
  if (original.length !== refined.length) {
    corrections.push(`Length: ${original.length} -> ${refined.length} chars`);
  }
  return corrections;
}
