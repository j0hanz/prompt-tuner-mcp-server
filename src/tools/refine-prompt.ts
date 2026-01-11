import { RefinePromptInputSchema } from '../schemas/inputs.js';
import { RefinePromptOutputSchema } from '../schemas/outputs.js';
import { TOOL_NAME } from './refine-prompt/constants.js';
import { resolveInputs } from './refine-prompt/inputs.js';
import { buildRefineResponse } from './refine-prompt/output.js';
import { refineWithLLM } from './refine-prompt/run.js';
import type { RefinePromptInput } from './refine-prompt/types.js';
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
