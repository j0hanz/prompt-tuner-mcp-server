import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

import type { ErrorResponse, OptimizeResponse } from '../config/types.js';
import { createErrorResponse, ErrorCode, McpError } from '../lib/errors.js';
import { getProviderInfo } from '../lib/llm-client.js';
import { normalizeScore } from '../lib/output-normalization.js';
import {
  OptimizePromptInputSchema,
  OptimizePromptOutputSchema,
} from '../schemas/index.js';
import {
  STRICT_OPTIMIZE_RULES,
  TOOL_NAME,
} from './optimize-prompt/constants.js';
import { resolveOptimizeInputs } from './optimize-prompt/inputs.js';
import { buildOptimizeResponse } from './optimize-prompt/output.js';
import { buildOptimizePrompt } from './optimize-prompt/prompt.js';
import { runOptimization } from './optimize-prompt/run.js';
import type {
  OptimizePromptInput,
  OptimizeValidationConfig,
  ResolvedOptimizeInputs,
} from './optimize-prompt/types.js';
import { validateOptimizeResult } from './optimize-prompt/validation.js';

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

function parseOptimizeInput(input: OptimizePromptInput): OptimizePromptInput {
  return OptimizePromptInputSchema.parse(input);
}

function buildValidationConfig(
  resolved: ResolvedOptimizeInputs
): OptimizeValidationConfig {
  return {
    allowedTechniques: resolved.effectiveTechniques,
    targetFormat: resolved.resolvedFormat,
  };
}

async function optimizeOnce(
  resolved: ResolvedOptimizeInputs,
  signal: AbortSignal,
  extraRules?: string
): Promise<{ result: OptimizeResponse; usedFallback: boolean }> {
  const optimizePrompt = buildOptimizePrompt(
    resolved.validatedPrompt,
    resolved.resolvedFormat,
    resolved.effectiveTechniques,
    extraRules
  );
  return runOptimization(optimizePrompt, signal);
}

async function runValidatedOptimization(
  resolved: ResolvedOptimizeInputs,
  signal: AbortSignal
): Promise<{ result: OptimizeResponse; usedFallback: boolean }> {
  const validationConfig = buildValidationConfig(resolved);
  const primary = await optimizeOnce(resolved, signal);
  const primaryValidation = validateOptimizeResult(
    primary.result,
    validationConfig
  );
  if (primaryValidation.ok) {
    return {
      result: primaryValidation.result,
      usedFallback: primary.usedFallback,
    };
  }

  const retry = await optimizeOnce(resolved, signal, STRICT_OPTIMIZE_RULES);
  const retryValidation = validateOptimizeResult(
    retry.result,
    validationConfig
  );
  if (!retryValidation.ok) {
    throw new McpError(
      ErrorCode.E_LLM_FAILED,
      `Optimized prompt failed validation${
        retryValidation.reason ? `: ${retryValidation.reason}` : ''
      }`
    );
  }
  return { result: retryValidation.result, usedFallback: true };
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

async function handleOptimizePrompt(
  input: OptimizePromptInput,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<ReturnType<typeof buildOptimizeResponse> | ErrorResponse> {
  try {
    const parsed = parseOptimizeInput(input);
    const resolved = resolveOptimizeInputs(parsed);
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
    return createErrorResponse(error, ErrorCode.E_LLM_FAILED, input.prompt);
  }
}

export function registerOptimizePromptTool(server: McpServer): void {
  server.registerTool(TOOL_NAME, OPTIMIZE_PROMPT_TOOL, handleOptimizePrompt);
}
