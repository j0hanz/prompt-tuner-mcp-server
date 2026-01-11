import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

import { LLM_TIMEOUT_MS, OPTIMIZE_MAX_TOKENS } from '../config/constants.js';
import type {
  ErrorResponse,
  OptimizationTechnique,
  OptimizeResponse,
  ProviderInfo,
  TargetFormat,
} from '../config/types.js';
import {
  createErrorResponse,
  createSuccessResponse,
  ErrorCode,
  McpError,
} from '../lib/errors.js';
import { getProviderInfo } from '../lib/llm-client.js';
import { normalizeScore } from '../lib/output-normalization.js';
import {
  containsOutputScaffolding,
  normalizePromptText,
  validateTechniqueOutput,
} from '../lib/output-validation.js';
import { resolveFormat } from '../lib/prompt-analysis/format.js';
import { wrapPromptData } from '../lib/prompt-policy.js';
import {
  asBulletList,
  asCodeBlock,
  buildOutput,
  formatProviderLine,
} from '../lib/tool-formatters.js';
import {
  executeLLMWithJsonResponse,
  extractPromptFromInput,
} from '../lib/tool-helpers.js';
import { validatePrompt } from '../lib/validation.js';
import { OptimizePromptInputSchema } from '../schemas/inputs.js';
import { OptimizeResponseSchema } from '../schemas/llm-responses.js';
import { OptimizePromptOutputSchema } from '../schemas/outputs.js';

const TOOL_NAME = 'optimize_prompt' as const;

const OPTIMIZE_SYSTEM_PROMPT = `<role>
You are an expert prompt optimizer.
</role>

<task>
Improve the prompt using the requested techniques while preserving intent and target format.
</task>

<requirements>
- Apply techniques in the given order; skip any that add no value
- Keep output aligned to the target format
- Provide before/after integer scores (0-100) and list improvements
- List only techniques actually applied
- Prefix each improvement with its technique (e.g., "basic: ...")
- If essential context is missing, include "Insufficient context: ..." in improvements
</requirements>

<techniques>
basic, chainOfThought, fewShot, roleBased, structured, comprehensive
</techniques>

<output_rules>
Return JSON only. No markdown or extra text.
</output_rules>

<schema>
{
  "optimized": string,
  "techniquesApplied": string[],
  "improvements": string[],
  "beforeScore": {
    "clarity": number,
    "specificity": number,
    "completeness": number,
    "structure": number,
    "effectiveness": number,
    "overall": number
  },
  "afterScore": {
    "clarity": number,
    "specificity": number,
    "completeness": number,
    "structure": number,
    "effectiveness": number,
    "overall": number
  }
}
</schema>`;

const STRICT_OPTIMIZE_RULES =
  '\nSTRICT RULES: Return JSON only. Ensure the optimized prompt actually follows each technique listed in techniquesApplied. If structured, include the proper XML/Markdown structure; if chainOfThought, include exactly one reasoning trigger; if fewShot, include 2-3 Input/Output examples; if roleBased, include a clear "You are a/an/the ..." role statement.';

const COMPREHENSIVE_TECHNIQUE_ORDER = [
  'basic',
  'roleBased',
  'structured',
  'fewShot',
  'chainOfThought',
] as const;
const DEFAULT_TECHNIQUES = ['basic'] as const;

type ConcreteTechnique = Exclude<OptimizationTechnique, 'comprehensive'>;

interface OptimizePromptInput {
  prompt: string;
  techniques?: readonly OptimizationTechnique[];
  targetFormat?: TargetFormat;
}

interface ResolvedOptimizeInputs {
  readonly validatedPrompt: string;
  readonly effectiveTechniques: readonly ConcreteTechnique[];
  readonly resolvedFormat: TargetFormat;
}

interface OptimizeValidationConfig {
  readonly allowedTechniques: readonly ConcreteTechnique[];
  readonly targetFormat: TargetFormat;
}

interface OptimizationMeta {
  readonly usedFallback: boolean;
  readonly scoreAdjusted: boolean;
  readonly overallSource: 'llm' | 'server';
}

const OPTIMIZE_PROMPT_TOOL = {
  title: 'Optimize Prompt',
  description:
    'Apply multiple optimization techniques using AI (e.g., ["basic", "roleBased", "structured"]). Returns before/after scores and improvements.',
  inputSchema: OptimizePromptInputSchema,
  outputSchema: OptimizePromptOutputSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
};

function isConcreteTechnique(
  technique: OptimizationTechnique
): technique is ConcreteTechnique {
  return technique !== 'comprehensive';
}

function resolveTechniques(
  techniques: readonly OptimizationTechnique[] | undefined
): readonly OptimizationTechnique[] {
  return techniques && techniques.length > 0 ? techniques : DEFAULT_TECHNIQUES;
}

function resolveOptimizeInputs(
  input: OptimizePromptInput
): ResolvedOptimizeInputs {
  const parsed = OptimizePromptInputSchema.parse(input);
  const requested = resolveTechniques(parsed.techniques);
  const effectiveTechniques = requested.includes('comprehensive')
    ? [...COMPREHENSIVE_TECHNIQUE_ORDER]
    : requested.filter(isConcreteTechnique);

  return {
    validatedPrompt: parsed.prompt,
    effectiveTechniques,
    resolvedFormat: resolveFormat(parsed.targetFormat, parsed.prompt),
  };
}

function buildOptimizePrompt(
  prompt: string,
  resolvedFormat: TargetFormat,
  techniques: readonly OptimizationTechnique[],
  extraRules?: string
): string {
  return `${OPTIMIZE_SYSTEM_PROMPT}\n\nTarget Format: ${resolvedFormat}\nTechniques to apply: ${techniques.join(
    ', '
  )}\n${extraRules ?? ''}\n\n<original_prompt>\n${wrapPromptData(
    prompt
  )}\n</original_prompt>`;
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

function normalizeOptimizeResult(result: OptimizeResponse): {
  normalized: OptimizeResponse;
  techniquesApplied: readonly OptimizationTechnique[];
  appliedConcrete: readonly ConcreteTechnique[];
} {
  const normalized = normalizePromptText(result.optimized);
  const techniquesApplied = Array.from(new Set(result.techniquesApplied));
  const appliedConcrete = techniquesApplied.filter(isConcreteTechnique);
  return {
    normalized: { ...result, optimized: normalized, techniquesApplied },
    techniquesApplied,
    appliedConcrete,
  };
}

function validateOptimizedText(normalized: OptimizeResponse): string | null {
  try {
    validatePrompt(normalized.optimized);
  } catch (error) {
    return error instanceof Error
      ? error.message
      : 'Optimized prompt is empty or invalid';
  }

  if (containsOutputScaffolding(normalized.optimized)) {
    return 'Output contains optimization scaffolding';
  }

  return null;
}

function hasUnexpectedTechniques(
  techniquesApplied: readonly OptimizationTechnique[],
  allowedSet: ReadonlySet<ConcreteTechnique>
): boolean {
  return techniquesApplied.some(
    (technique) => technique !== 'comprehensive' && !allowedSet.has(technique)
  );
}

function validateAppliedTechniques(
  techniquesApplied: readonly OptimizationTechnique[],
  appliedConcrete: readonly ConcreteTechnique[],
  allowedSet: ReadonlySet<ConcreteTechnique>
): string | null {
  if (hasUnexpectedTechniques(techniquesApplied, allowedSet)) {
    return 'Unexpected techniques reported';
  }
  if (!appliedConcrete.length) {
    return 'No techniques applied';
  }
  return null;
}

function validateTechniqueOutputs(
  text: string,
  appliedTechniques: readonly ConcreteTechnique[],
  targetFormat: TargetFormat
): string | null {
  for (const technique of appliedTechniques) {
    const validation = validateTechniqueOutput(text, technique, targetFormat);
    if (!validation.ok) {
      return validation.reason ?? 'Technique validation failed';
    }
  }
  return null;
}

function validateOptimizeResult(
  result: OptimizeResponse,
  config: OptimizeValidationConfig
): { ok: boolean; result: OptimizeResponse; reason?: string } {
  const normalizedResult = normalizeOptimizeResult(result);
  const allowedSet = new Set(config.allowedTechniques);
  const fail = (
    reason: string
  ): { ok: false; result: OptimizeResponse; reason: string } => ({
    ok: false,
    result: normalizedResult.normalized,
    reason,
  });

  const textIssue = validateOptimizedText(normalizedResult.normalized);
  if (textIssue) {
    return fail(textIssue);
  }

  const techniqueIssue = validateAppliedTechniques(
    normalizedResult.techniquesApplied,
    normalizedResult.appliedConcrete,
    allowedSet
  );
  if (techniqueIssue) {
    return fail(techniqueIssue);
  }

  const outputIssue = validateTechniqueOutputs(
    normalizedResult.normalized.optimized,
    normalizedResult.appliedConcrete,
    config.targetFormat
  );
  if (outputIssue) {
    return fail(outputIssue);
  }

  return { ok: true, result: normalizedResult.normalized };
}

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

function buildOptimizeValidationConfig(
  resolved: ResolvedOptimizeInputs
): OptimizeValidationConfig {
  return {
    allowedTechniques: resolved.effectiveTechniques,
    targetFormat: resolved.resolvedFormat,
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

async function runValidatedOptimization(
  resolved: ResolvedOptimizeInputs,
  signal: AbortSignal
): Promise<{ result: OptimizeResponse; usedFallback: boolean }> {
  const validationConfig = buildOptimizeValidationConfig(resolved);
  const resolveRemainingTimeout = createTimeoutBudget(
    'Optimization',
    LLM_TIMEOUT_MS
  );
  const primary = await runOptimizationAttempt(
    resolved,
    signal,
    resolveRemainingTimeout(),
    validationConfig
  );
  if (primary.ok) {
    return {
      result: primary.result,
      usedFallback: primary.usedFallback,
    };
  }
  const retry = await runOptimizationAttempt(
    resolved,
    signal,
    resolveRemainingTimeout(),
    validationConfig,
    STRICT_OPTIMIZE_RULES
  );
  if (!retry.ok) {
    throw new McpError(
      ErrorCode.E_LLM_FAILED,
      `Optimized prompt failed validation${
        retry.reason ? `: ${retry.reason}` : ''
      }`
    );
  }
  return { result: retry.result, usedFallback: true };
}

function normalizeOptimizationScores(result: OptimizeResponse): {
  result: OptimizeResponse;
  scoreAdjusted: boolean;
  overallSource: 'llm' | 'server';
} {
  const normalizedBefore = normalizeScore(result.beforeScore);
  const normalizedAfter = normalizeScore(result.afterScore);
  const scoreAdjusted = normalizedBefore.adjusted || normalizedAfter.adjusted;
  const overallSource = scoreAdjusted ? 'server' : 'llm';

  return {
    result: {
      ...result,
      beforeScore: normalizedBefore.score,
      afterScore: normalizedAfter.score,
    },
    scoreAdjusted,
    overallSource,
  };
}

function formatImprovements(improvements: readonly string[]): string[] {
  const cleaned = improvements.map((item) => item.trim()).filter(Boolean);
  return asBulletList(cleaned);
}

function formatScoreLines(
  before: OptimizeResponse['beforeScore'],
  after: OptimizeResponse['afterScore']
): string[] {
  const delta = after.overall - before.overall;
  let deltaText = 'Delta: 0';
  if (delta !== 0) {
    const sign = delta > 0 ? '+' : '';
    deltaText = `Delta: ${sign}${delta}`;
  }

  const beforeLine =
    `Before: ${before.overall}/100 (clarity ${before.clarity}, ` +
    `specificity ${before.specificity}, completeness ${before.completeness}, ` +
    `structure ${before.structure}, effectiveness ${before.effectiveness})`;
  const afterLine =
    `After: ${after.overall}/100 (clarity ${after.clarity}, ` +
    `specificity ${after.specificity}, completeness ${after.completeness}, ` +
    `structure ${after.structure}, effectiveness ${after.effectiveness})`;

  return asBulletList([beforeLine, afterLine, deltaText]);
}

function formatOptimizeOutput(
  optimizationResult: OptimizeResponse,
  targetFormat: TargetFormat,
  provider: ProviderInfo
): string {
  return buildOutput(
    'Prompt Optimization',
    [formatProviderLine(provider), `Target format: ${targetFormat}`],
    [
      {
        title: 'Scores',
        lines: formatScoreLines(
          optimizationResult.beforeScore,
          optimizationResult.afterScore
        ),
      },
      {
        title: 'Techniques Applied',
        lines: asBulletList(optimizationResult.techniquesApplied),
      },
      {
        title: 'Improvements',
        lines: formatImprovements(optimizationResult.improvements),
      },
      {
        title: 'Optimized Prompt',
        lines: asCodeBlock(optimizationResult.optimized),
      },
    ]
  );
}

function buildOptimizeResponse(
  result: OptimizeResponse,
  original: string,
  targetFormat: TargetFormat,
  provider: ProviderInfo,
  meta: OptimizationMeta
): ReturnType<typeof createSuccessResponse> {
  const scoreDelta = result.afterScore.overall - result.beforeScore.overall;
  const output = formatOptimizeOutput(result, targetFormat, provider);
  return createSuccessResponse(output, {
    ok: true,
    original,
    optimized: result.optimized,
    techniquesApplied: result.techniquesApplied,
    targetFormat,
    beforeScore: result.beforeScore,
    afterScore: result.afterScore,
    improvements: result.improvements,
    usedFallback: meta.usedFallback,
    scoreAdjusted: meta.scoreAdjusted,
    overallSource: meta.overallSource,
    scoreDelta,
    provider: provider.provider,
    model: provider.model,
  });
}

async function handleOptimizePrompt(
  input: OptimizePromptInput,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<ReturnType<typeof createSuccessResponse> | ErrorResponse> {
  try {
    const resolved = resolveOptimizeInputs(input);
    const { result, usedFallback } = await runValidatedOptimization(
      resolved,
      extra.signal
    );
    const normalized = normalizeOptimizationScores(result);
    const provider = await getProviderInfo();

    return buildOptimizeResponse(
      normalized.result,
      resolved.validatedPrompt,
      resolved.resolvedFormat,
      provider,
      {
        usedFallback,
        scoreAdjusted: normalized.scoreAdjusted,
        overallSource: normalized.overallSource,
      }
    );
  } catch (error) {
    return createErrorResponse(
      error,
      ErrorCode.E_LLM_FAILED,
      extractPromptFromInput(input)
    );
  }
}

export function registerOptimizePromptTool(server: McpServer): void {
  server.registerTool(TOOL_NAME, OPTIMIZE_PROMPT_TOOL, handleOptimizePrompt);
}
