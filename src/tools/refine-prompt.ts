import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

import type { OptimizationTechnique, TargetFormat } from '../config/types.js';
import { getCachedRefinement, setCachedRefinement } from '../lib/cache.js';
import {
  createSuccessResponse,
  ErrorCode,
  logger,
  toJsonRpcError,
} from '../lib/errors.js';
import { refineLLM } from '../lib/llm.js';
import { resolveFormat } from '../lib/prompt-analysis.js';
import { getToolContext } from '../lib/tool-context.js';
import {
  validateFormat,
  validatePrompt,
  validateTechnique,
} from '../lib/validation.js';
import {
  RefinePromptInputSchema,
  RefinePromptOutputSchema,
} from '../schemas/index.js';

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

const REFINE_PROMPT_TOOL = {
  title: 'Refine Prompt',
  description:
    'Fix grammar, improve clarity, and apply optimization techniques. Use when: user asks to fix/improve/optimize a prompt, prompt has typos, or prompt is vague. Default technique: "basic" for quick fixes. Use "comprehensive" for best results.',
  inputSchema: RefinePromptInputSchema.shape,
  outputSchema: RefinePromptOutputSchema.shape,
  annotations: {
    readOnlyHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
};

function resolveInputs(input: RefinePromptInput): ResolvedRefineInputs {
  const validatedPrompt = validatePrompt(input.prompt);
  const technique = input.technique ?? 'basic';
  const targetFormat = input.targetFormat ?? 'auto';
  const validatedTechnique = validateTechnique(technique);
  const validatedFormat = validateFormat(targetFormat);
  const resolvedFormat = resolveFormat(validatedFormat, validatedPrompt);
  return { validatedPrompt, validatedTechnique, resolvedFormat };
}

function buildCacheHitResponse(
  refined: string,
  input: ResolvedRefineInputs
): ReturnType<typeof createSuccessResponse> {
  logger.debug('Cache hit for refinement');
  return createSuccessResponse(refined, {
    ok: true,
    original: input.validatedPrompt,
    refined,
    corrections: ['Retrieved from cache'],
    technique: input.validatedTechnique,
    targetFormat: input.resolvedFormat,
    usedFallback: false,
    fromCache: true,
  });
}

function buildRefineResponse(
  refined: string,
  corrections: string[],
  input: ResolvedRefineInputs
): ReturnType<typeof createSuccessResponse> {
  return createSuccessResponse(refined, {
    ok: true,
    original: input.validatedPrompt,
    refined,
    corrections,
    technique: input.validatedTechnique,
    targetFormat: input.resolvedFormat,
    usedFallback: false,
    fromCache: false,
  });
}

async function refineAndCache(
  input: ResolvedRefineInputs,
  signal: AbortSignal
): Promise<{ refined: string; corrections: string[] }> {
  const refined = await refineLLM(
    input.validatedPrompt,
    input.validatedTechnique,
    input.resolvedFormat,
    2000,
    60000,
    signal
  );
  const corrections: string[] = [];
  if (refined !== input.validatedPrompt) {
    corrections.push('Applied LLM refinement');
    corrections.push(`Technique: ${input.validatedTechnique}`);
    setCachedRefinement(
      input.validatedPrompt,
      input.validatedTechnique,
      input.resolvedFormat,
      refined
    );
  } else {
    corrections.push('No changes needed - prompt is already well-formed');
  }
  return { refined, corrections };
}

async function handleRefinePrompt(
  input: RefinePromptInput,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<ReturnType<typeof createSuccessResponse>> {
  const context = getToolContext(extra);

  try {
    const resolved = resolveInputs(input);
    const cached = getCachedRefinement(
      resolved.validatedPrompt,
      resolved.validatedTechnique,
      resolved.resolvedFormat
    );
    if (cached) return buildCacheHitResponse(cached, resolved);
    const { refined, corrections } = await refineAndCache(
      resolved,
      context.request.signal
    );
    return buildRefineResponse(refined, corrections, resolved);
  } catch (error) {
    throw toJsonRpcError(error, ErrorCode.E_LLM_FAILED, input.prompt);
  }
}

export function registerRefinePromptTool(server: McpServer): void {
  server.registerTool('refine_prompt', REFINE_PROMPT_TOOL, handleRefinePrompt);
}
