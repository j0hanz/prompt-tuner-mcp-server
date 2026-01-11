import { OptimizePromptInputSchema } from '../schemas/inputs.js';
import { OptimizePromptOutputSchema } from '../schemas/outputs.js';
import { TOOL_NAME } from './optimize-prompt/constants.js';
import { resolveOptimizeInputs } from './optimize-prompt/inputs.js';
import {
  buildOptimizeResponse,
  normalizeOptimizationScores,
} from './optimize-prompt/output.js';
import { runValidatedOptimization } from './optimize-prompt/run.js';
import type {
  OptimizationMeta,
  OptimizePromptInput,
  ResolvedOptimizeInputs,
} from './optimize-prompt/types.js';
import {
  createErrorResponse,
  ErrorCode,
  extractPromptFromInput,
  getProviderInfo,
} from './tool-runtime.js';
import type {
  createSuccessResponse,
  ErrorResponse,
  McpServer,
  RequestHandlerExtra,
  ServerNotification,
  ServerRequest,
} from './tool-types.js';

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

async function buildOptimizationResponse(
  resolved: ResolvedOptimizeInputs,
  signal: AbortSignal
): Promise<ReturnType<typeof createSuccessResponse>> {
  const { result, usedFallback } = await runValidatedOptimization(
    resolved,
    signal
  );
  const normalized = normalizeOptimizationScores(result);
  const provider = await getProviderInfo();
  const meta: OptimizationMeta = {
    usedFallback,
    scoreAdjusted: normalized.scoreAdjusted,
    overallSource: normalized.overallSource,
  };

  return buildOptimizeResponse(
    normalized.result,
    resolved.validatedPrompt,
    resolved.resolvedFormat,
    provider,
    meta
  );
}

async function handleOptimizePrompt(
  input: OptimizePromptInput,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<ReturnType<typeof createSuccessResponse> | ErrorResponse> {
  try {
    const resolved = resolveOptimizeInputs(input);
    return await buildOptimizationResponse(resolved, extra.signal);
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
