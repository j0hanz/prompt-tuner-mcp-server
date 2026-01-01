import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

import { LLM_TIMEOUT_MS, REFINE_MAX_TOKENS } from '../config/constants.js';
import type {
  ErrorResponse,
  OptimizationTechnique,
  TargetFormat,
} from '../config/types.js';
import {
  createErrorResponse,
  createSuccessResponse,
  ErrorCode,
  McpError,
} from '../lib/errors.js';
import { getProviderInfo } from '../lib/llm-client.js';
import { refineLLM } from '../lib/llm.js';
import {
  containsOutputScaffolding,
  normalizePromptText,
  validateTechniqueOutput,
} from '../lib/output-validation.js';
import { resolveFormat } from '../lib/prompt-analysis/format.js';
import {
  asBulletList,
  asCodeBlock,
  buildOutput,
  formatProviderLine,
} from '../lib/tool-formatters.js';
import { extractPromptFromInput } from '../lib/tool-helpers.js';
import { buildPromptResourceBlock } from '../lib/tool-resources.js';
import { validatePrompt } from '../lib/validation.js';
import {
  RefinePromptInputSchema,
  RefinePromptOutputSchema,
} from '../schemas/index.js';

const REFINE_PROMPT_TOOL = {
  title: 'Refine Prompt',
  description:
    'Fix grammar, improve clarity, and apply optimization techniques. Use when: user asks to fix/improve/optimize a prompt, prompt has typos, or prompt is vague. Default technique: "basic" for quick fixes. Use "comprehensive" for best results.',
  inputSchema: RefinePromptInputSchema,
  outputSchema: RefinePromptOutputSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
};

const TOOL_NAME = 'refine_prompt' as const;
const STRICT_REFINEMENT_RULES =
  '\nSTRICT RULES: Return only the refined prompt text. Do not include headings, explanations, or code fences. Ensure the output follows the selected technique and target format.';

interface RefinePromptInput {
  prompt: string;
  technique?: string;
  targetFormat?: string;
}

interface ResolvedRefineInputs {
  validatedPrompt: string;
  validatedTechnique: OptimizationTechnique;
  resolvedFormat: TargetFormat;
}

interface RefinementAttemptPlan {
  technique: OptimizationTechnique;
  extraInstructions?: string;
  usedFallback: boolean;
}

interface ProviderInfo {
  provider: string;
  model: string;
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

function buildRefineOutput(
  refined: string,
  corrections: string[],
  input: ResolvedRefineInputs,
  techniqueUsed: OptimizationTechnique,
  provider: ProviderInfo
): string {
  const meta = [
    formatProviderLine(provider),
    `Technique: ${techniqueUsed}`,
    `Target format: ${input.resolvedFormat}`,
  ];

  return buildOutput('Prompt Refinement', meta, [
    { title: 'Refined Prompt', lines: asCodeBlock(refined) },
    { title: 'Changes', lines: asBulletList(corrections) },
  ]);
}

function buildRefineResponse(
  refined: string,
  corrections: string[],
  input: ResolvedRefineInputs,
  techniqueUsed: OptimizationTechnique,
  usedFallback: boolean,
  provider: ProviderInfo
): ReturnType<typeof createSuccessResponse> {
  const output = buildRefineOutput(
    refined,
    corrections,
    input,
    techniqueUsed,
    provider
  );
  const promptResource = buildPromptResourceBlock(
    refined,
    `refined-prompt-${techniqueUsed}-${input.resolvedFormat}`
  );
  return createSuccessResponse(
    output,
    {
      ok: true,
      original: input.validatedPrompt,
      refined,
      corrections,
      technique: techniqueUsed,
      targetFormat: input.resolvedFormat,
      usedFallback,
      provider: provider.provider,
      model: provider.model,
    },
    [promptResource]
  );
}

function resolveInputs(input: RefinePromptInput): ResolvedRefineInputs {
  const parsed = RefinePromptInputSchema.parse(input);
  return {
    validatedPrompt: parsed.prompt,
    validatedTechnique: parsed.technique,
    resolvedFormat: resolveFormat(parsed.targetFormat, parsed.prompt),
  };
}

function validateRefinedOutput(
  output: string,
  technique: OptimizationTechnique,
  targetFormat: TargetFormat
): string | null {
  const checks = [
    validatePromptOutput(output),
    validateScaffolding(output),
    validateTechnique(output, technique, targetFormat),
  ];
  return checks.find((issue) => issue !== null) ?? null;
}

function validatePromptOutput(output: string): string | null {
  try {
    validatePrompt(output);
    return null;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : 'Refined prompt is empty or invalid';
  }
}

function validateScaffolding(output: string): string | null {
  return containsOutputScaffolding(output)
    ? 'Output contains scaffolding or formatting'
    : null;
}

function validateTechnique(
  output: string,
  technique: OptimizationTechnique,
  targetFormat: TargetFormat
): string | null {
  const validation = validateTechniqueOutput(output, technique, targetFormat);
  return validation.ok ? null : (validation.reason ?? 'Validation failed');
}

function buildRefinementPlan(
  technique: OptimizationTechnique
): RefinementAttemptPlan[] {
  const plan: RefinementAttemptPlan[] = [
    { technique, usedFallback: false },
    {
      technique,
      extraInstructions: STRICT_REFINEMENT_RULES,
      usedFallback: true,
    },
  ];

  if (technique !== 'basic') {
    plan.push({
      technique: 'basic',
      extraInstructions: STRICT_REFINEMENT_RULES,
      usedFallback: true,
    });
  }

  return plan;
}

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
  const refinedRaw = await refineLLM(
    input.validatedPrompt,
    attempt.technique,
    input.resolvedFormat,
    REFINE_MAX_TOKENS,
    timeoutMs,
    signal,
    attempt.extraInstructions
  );

  const { normalized } = normalizePromptText(refinedRaw);
  const reason = validateRefinedOutput(
    normalized,
    attempt.technique,
    input.resolvedFormat
  );

  return {
    refined: normalized,
    reason,
    techniqueUsed: attempt.technique,
    usedFallback: attempt.usedFallback,
  };
}

function resolveRemainingTimeout(deadlineMs: number): number {
  const remaining = deadlineMs - Date.now();
  if (remaining <= 0) {
    throw new McpError(ErrorCode.E_TIMEOUT, 'Refinement budget exceeded');
  }
  return remaining;
}

async function refineWithLLM(
  input: ResolvedRefineInputs,
  signal: AbortSignal
): Promise<{
  refined: string;
  corrections: string[];
  techniqueUsed: OptimizationTechnique;
  usedFallback: boolean;
}> {
  const plan = buildRefinementPlan(input.validatedTechnique);
  let lastReason: string | null = null;
  const deadlineMs = Date.now() + LLM_TIMEOUT_MS;

  for (const attempt of plan) {
    const remainingMs = resolveRemainingTimeout(deadlineMs);
    const result = await runRefinementAttempt(
      input,
      attempt,
      signal,
      remainingMs
    );

    if (!result.reason) {
      const corrections = buildCorrections(
        input.validatedPrompt,
        result.refined
      );
      return {
        refined: result.refined,
        corrections,
        techniqueUsed: result.techniqueUsed,
        usedFallback: result.usedFallback,
      };
    }

    lastReason = result.reason;
  }

  throw new McpError(
    ErrorCode.E_LLM_FAILED,
    `Refined prompt failed validation${lastReason ? `: ${lastReason}` : ''}`
  );
}

async function handleRefinePrompt(
  input: RefinePromptInput,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<ReturnType<typeof createSuccessResponse> | ErrorResponse> {
  try {
    const resolved = resolveInputs(input);
    const { refined, corrections, techniqueUsed, usedFallback } =
      await refineWithLLM(resolved, extra.signal);
    const provider = await getProviderInfo();
    return buildRefineResponse(
      refined,
      corrections,
      resolved,
      techniqueUsed,
      usedFallback,
      provider
    );
  } catch (error) {
    return createErrorResponse(
      error,
      ErrorCode.E_LLM_FAILED,
      extractPromptFromInput(input)
    );
  }
}

export function registerRefinePromptTool(server: McpServer): void {
  server.registerTool(TOOL_NAME, REFINE_PROMPT_TOOL, handleRefinePrompt);
}
