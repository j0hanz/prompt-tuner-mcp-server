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
import { createErrorResponse, ErrorCode, McpError } from '../lib/errors.js';
import type { createSuccessResponse } from '../lib/errors.js';
import { getProviderInfo } from '../lib/llm-client.js';
import { refineLLM } from '../lib/llm.js';
import {
  containsOutputScaffolding,
  normalizePromptText,
  validateTechniqueOutput,
} from '../lib/output-validation.js';
import { resolveFormat } from '../lib/prompt-analysis.js';
import { extractPromptFromInput } from '../lib/tool-helpers.js';
import { validatePrompt } from '../lib/validation.js';
import {
  RefinePromptInputSchema,
  RefinePromptOutputSchema,
} from '../schemas/index.js';
import {
  buildCorrections,
  buildRefineResponse,
} from './refine-prompt/formatters.js';
import type {
  RefinementAttemptPlan,
  RefinePromptInput,
  ResolvedRefineInputs,
} from './refine-prompt/types.js';

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

function parseRefineInput(input: RefinePromptInput): {
  prompt: string;
  technique: OptimizationTechnique;
  targetFormat: TargetFormat;
} {
  return RefinePromptInputSchema.parse(input);
}

function resolveInputs(input: RefinePromptInput): ResolvedRefineInputs {
  const parsed = parseRefineInput(input);
  const resolvedFormat = resolveFormat(parsed.targetFormat, parsed.prompt);
  return {
    validatedPrompt: parsed.prompt,
    validatedTechnique: parsed.technique,
    resolvedFormat,
  };
}

function buildRefinementRequester(
  input: ResolvedRefineInputs,
  signal: AbortSignal
): (technique: OptimizationTechnique, extra?: string) => Promise<string> {
  return async (
    technique: OptimizationTechnique,
    extraInstructions?: string
  ): Promise<string> =>
    refineLLM(
      input.validatedPrompt,
      technique,
      input.resolvedFormat,
      REFINE_MAX_TOKENS,
      LLM_TIMEOUT_MS,
      signal,
      extraInstructions
    );
}

function validateRefinedOutput(
  output: string,
  technique: OptimizationTechnique,
  targetFormat: TargetFormat
): { ok: boolean; reason?: string } {
  try {
    validatePrompt(output);
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? error.message
          : 'Refined prompt is empty or invalid',
    };
  }
  if (containsOutputScaffolding(output)) {
    return { ok: false, reason: 'Output contains scaffolding or formatting' };
  }
  const validation = validateTechniqueOutput(output, technique, targetFormat);
  return validation.ok
    ? { ok: true }
    : { ok: false, reason: validation.reason };
}

async function runRefinementAttempt(
  request: (
    technique: OptimizationTechnique,
    extra?: string
  ) => Promise<string>,
  technique: OptimizationTechnique,
  targetFormat: TargetFormat,
  extraInstructions?: string
): Promise<{ refined: string; validation: { ok: boolean; reason?: string } }> {
  const refined = await request(technique, extraInstructions);
  const { normalized } = normalizePromptText(refined);
  return {
    refined: normalized,
    validation: validateRefinedOutput(normalized, technique, targetFormat),
  };
}

function buildRefinementResult(
  input: ResolvedRefineInputs,
  refined: string,
  techniqueUsed: OptimizationTechnique,
  usedFallback: boolean
): {
  refined: string;
  corrections: string[];
  techniqueUsed: OptimizationTechnique;
  usedFallback: boolean;
} {
  const corrections = buildCorrections(input.validatedPrompt, refined);
  return { refined, corrections, techniqueUsed, usedFallback };
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

async function executeRefinementPlan(
  plan: RefinementAttemptPlan[],
  request: (
    technique: OptimizationTechnique,
    extra?: string
  ) => Promise<string>,
  targetFormat: TargetFormat
): Promise<{
  refined: string;
  techniqueUsed: OptimizationTechnique;
  usedFallback: boolean;
}> {
  let lastReason: string | undefined;

  for (const attempt of plan) {
    const result = await runRefinementAttempt(
      request,
      attempt.technique,
      targetFormat,
      attempt.extraInstructions
    );
    if (result.validation.ok) {
      return {
        refined: result.refined,
        techniqueUsed: attempt.technique,
        usedFallback: attempt.usedFallback,
      };
    }
    lastReason = result.validation.reason;
  }

  throw new McpError(
    ErrorCode.E_LLM_FAILED,
    `Refined prompt failed validation${lastReason ? `: ${lastReason}` : ''}`
  );
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
  const request = buildRefinementRequester(input, signal);
  const plan = buildRefinementPlan(input.validatedTechnique);
  const resolved = await executeRefinementPlan(
    plan,
    request,
    input.resolvedFormat
  );

  return buildRefinementResult(
    input,
    resolved.refined,
    resolved.techniqueUsed,
    resolved.usedFallback
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
