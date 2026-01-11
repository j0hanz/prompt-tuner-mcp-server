import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

import type { ErrorResponse } from '../config/types.js';
import { createErrorResponse, ErrorCode, logger } from '../lib/errors.js';
import { getProviderInfo } from '../lib/llm-client.js';
import { extractPromptFromInput } from '../lib/llm-tool-execution.js';
import { AnalyzePromptInputSchema } from '../schemas/inputs.js';
import { AnalyzePromptOutputSchema } from '../schemas/outputs.js';
import { TOOL_NAME } from './analyze-prompt/constants.js';
import {
  buildAnalysisResponse,
  normalizeAnalysisResult,
} from './analyze-prompt/output.js';
import { sendProgress } from './analyze-prompt/progress.js';
import { buildAnalysisPrompt } from './analyze-prompt/prompt.js';
import { runAnalysis } from './analyze-prompt/run.js';

const ANALYZE_PROMPT_TOOL = {
  title: 'Analyze Prompt',
  description:
    'Score prompt quality (0-100) across 5 dimensions using AI analysis: clarity, specificity, completeness, structure, effectiveness. Returns actionable suggestions.',
  inputSchema: AnalyzePromptInputSchema,
  outputSchema: AnalyzePromptOutputSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
};

async function buildAnalysisForPrompt(
  prompt: string,
  signal: AbortSignal | undefined
): Promise<ReturnType<typeof buildAnalysisResponse>> {
  const analysisPrompt = buildAnalysisPrompt(prompt);
  const { result, usedFallback } = await runAnalysis(analysisPrompt, signal);
  const normalized = normalizeAnalysisResult(result, prompt);

  const provider = await getProviderInfo();
  return buildAnalysisResponse(normalized.analysisResult, provider, {
    usedFallback,
    scoreAdjusted: normalized.scoreAdjusted,
    overallSource: normalized.overallSource,
  });
}

async function handleAnalyzePrompt(
  input: { prompt: string },
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<ReturnType<typeof buildAnalysisResponse> | ErrorResponse> {
  try {
    const parsed = AnalyzePromptInputSchema.parse(input);
    logger.info(
      { sessionId: extra.sessionId, promptLength: parsed.prompt.length },
      `${TOOL_NAME} called`
    );
    await sendProgress(extra, 'started', 0);

    const response = await buildAnalysisForPrompt(parsed.prompt, extra.signal);

    await sendProgress(extra, 'completed', 100);

    return response;
  } catch (error) {
    return createErrorResponse(
      error,
      ErrorCode.E_LLM_FAILED,
      extractPromptFromInput(input)
    );
  }
}

export function registerAnalyzePromptTool(server: McpServer): void {
  server.registerTool(TOOL_NAME, ANALYZE_PROMPT_TOOL, handleAnalyzePrompt);
}
