import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

import { ANALYSIS_MAX_TOKENS, LLM_TIMEOUT_MS } from '../config/constants.js';
import type { AnalysisResponse, ErrorResponse } from '../config/types.js';
import {
  createErrorResponse,
  createSuccessResponse,
  ErrorCode,
  logger,
} from '../lib/errors.js';
import { getProviderInfo } from '../lib/llm-client.js';
import {
  mergeCharacteristics,
  normalizeScore,
} from '../lib/output-normalization.js';
import {
  INPUT_HANDLING_SECTION,
  wrapPromptData,
} from '../lib/prompt-policy.js';
import { getToolContext, type ToolContext } from '../lib/tool-context.js';
import {
  asBulletList,
  asNumberedList,
  buildOutput,
  formatProviderLine,
} from '../lib/tool-formatters.js';
import { executeLLMWithJsonResponse } from '../lib/tool-helpers.js';
import { validatePrompt } from '../lib/validation.js';
import {
  AnalyzePromptInputSchema,
  AnalyzePromptOutputSchema,
} from '../schemas/index.js';
import { AnalysisResponseSchema } from '../schemas/llm-responses.js';

const ANALYSIS_SYSTEM_PROMPT = `<role>
You are an expert prompt analyst.
</role>

<task>
Score prompt quality and return structured JSON.
</task>

${INPUT_HANDLING_SECTION}

<requirements>
- Use only the provided prompt
- Provide integer scores (0-100) for clarity, specificity, completeness, structure, effectiveness, overall
- Fill all characteristics fields and 2-3 actionable suggestions
- Set missingContext true when essential context is absent
- If essential context is missing, include a suggestion starting with "Insufficient context: ..."
- Detect format as claude | gpt | json | auto
</requirements>

<output_rules>
Return JSON only. No markdown, code fences, or extra text.
</output_rules>

<schema>
{
  "score": {
    "clarity": number,
    "specificity": number,
    "completeness": number,
    "structure": number,
    "effectiveness": number,
    "overall": number
  },
  "characteristics": {
    "hasTypos": boolean,
    "isVague": boolean,
    "missingContext": boolean,
    "hasRoleContext": boolean,
    "hasExamples": boolean,
    "hasStructure": boolean,
    "hasStepByStep": boolean,
    "wordCount": number,
    "detectedFormat": "claude" | "gpt" | "json" | "auto",
    "estimatedComplexity": "simple" | "moderate" | "complex"
  },
  "suggestions": string[]
}
</schema>`;

const TOOL_NAME = 'analyze_prompt' as const;

interface AnalyzePromptInput {
  prompt: string;
}

const ANALYZE_PROMPT_TOOL = {
  title: 'Analyze Prompt',
  description:
    'Score prompt quality (0-100) across 5 dimensions using AI analysis: clarity, specificity, completeness, structure, effectiveness. Returns actionable suggestions.',
  inputSchema: AnalyzePromptInputSchema.shape,
  outputSchema: AnalyzePromptOutputSchema.shape,
  annotations: {
    readOnlyHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
};

function formatYesNo(label: string, value: boolean): string {
  return `${label}: ${value ? 'Yes' : 'No'}`;
}

function formatScoreLines(score: AnalysisResponse['score']): string[] {
  return asBulletList([
    `Clarity: ${score.clarity}/100`,
    `Specificity: ${score.specificity}/100`,
    `Completeness: ${score.completeness}/100`,
    `Structure: ${score.structure}/100`,
    `Effectiveness: ${score.effectiveness}/100`,
    `Overall: ${score.overall}/100`,
  ]);
}

function formatCharacteristicLines(
  characteristics: AnalysisResponse['characteristics']
): string[] {
  return asBulletList([
    formatYesNo('Typos detected', characteristics.hasTypos),
    formatYesNo('Vague language', characteristics.isVague),
    formatYesNo('Missing context', characteristics.missingContext),
    formatYesNo('Role defined', characteristics.hasRoleContext),
    formatYesNo('Examples present', characteristics.hasExamples),
    formatYesNo('Structured sections', characteristics.hasStructure),
    formatYesNo('Step-by-step guidance', characteristics.hasStepByStep),
    `Detected format: ${characteristics.detectedFormat}`,
    `Complexity: ${characteristics.estimatedComplexity}`,
    `Word count: ${characteristics.wordCount}`,
  ]);
}

function formatAnalysisOutput(
  analysisResult: AnalysisResponse,
  provider: { provider: string; model: string }
): string {
  return buildOutput(
    'Prompt Analysis',
    [formatProviderLine(provider)],
    [
      { title: 'Scores', lines: formatScoreLines(analysisResult.score) },
      {
        title: 'Characteristics',
        lines: formatCharacteristicLines(analysisResult.characteristics),
      },
      {
        title: 'Suggestions',
        lines: asNumberedList(analysisResult.suggestions),
      },
    ]
  );
}

async function sendProgress(
  context: ToolContext,
  message: string,
  progress: number
): Promise<void> {
  const progressToken = context._meta?.progressToken;
  if (progressToken === undefined) return;

  try {
    await context.sendNotification({
      method: 'notifications/progress',
      params: {
        progressToken,
        progress,
        message,
        _meta: {
          tool: TOOL_NAME,
          requestId: context.requestId,
          sessionId: context.sessionId,
        },
      },
    });
  } catch (error) {
    logger.debug({ error }, 'analyze_prompt progress notification failed');
  }
}

function buildAnalysisPrompt(prompt: string): string {
  return `${ANALYSIS_SYSTEM_PROMPT}\n\n<prompt_to_analyze>\n${wrapPromptData(
    prompt
  )}\n</prompt_to_analyze>`;
}

async function runAnalysis(
  analysisPrompt: string,
  signal?: AbortSignal
): Promise<{ result: AnalysisResponse; usedFallback: boolean }> {
  const { value, usedFallback } =
    await executeLLMWithJsonResponse<AnalysisResponse>(
      analysisPrompt,
      (value) => AnalysisResponseSchema.parse(value),
      ErrorCode.E_LLM_FAILED,
      TOOL_NAME,
      {
        maxTokens: ANALYSIS_MAX_TOKENS,
        timeoutMs: LLM_TIMEOUT_MS,
        signal,
        retryOnParseFailure: true,
      }
    );
  return { result: value, usedFallback };
}

function buildAnalysisResponse(
  analysisResult: AnalysisResponse,
  provider: { provider: string; model: string },
  meta: { usedFallback: boolean; scoreAdjusted: boolean; overallSource: string }
): ReturnType<typeof createSuccessResponse> {
  const output = formatAnalysisOutput(analysisResult, provider);
  return createSuccessResponse(output, {
    ok: true,
    hasTypos: analysisResult.characteristics.hasTypos,
    isVague: analysisResult.characteristics.isVague,
    missingContext: analysisResult.characteristics.missingContext,
    suggestions: analysisResult.suggestions,
    score: analysisResult.score,
    characteristics: analysisResult.characteristics,
    usedFallback: meta.usedFallback,
    scoreAdjusted: meta.scoreAdjusted,
    overallSource: meta.overallSource,
    provider: provider.provider,
    model: provider.model,
  });
}

async function handleAnalyzePrompt(
  input: AnalyzePromptInput,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<ReturnType<typeof createSuccessResponse> | ErrorResponse> {
  const context = getToolContext(extra);

  try {
    logger.info(
      { sessionId: context.sessionId, promptLength: input.prompt.length },
      `${TOOL_NAME} called`
    );

    const validatedPrompt = validatePrompt(input.prompt);
    await sendProgress(context, 'started', 0);

    const analysisPrompt = buildAnalysisPrompt(validatedPrompt);
    const { result, usedFallback } = await runAnalysis(
      analysisPrompt,
      context.request.signal
    );
    const normalizedScore = normalizeScore(result.score);
    const characteristics = mergeCharacteristics(
      validatedPrompt,
      result.characteristics
    );
    const analysisResult: AnalysisResponse = {
      ...result,
      score: normalizedScore.score,
      characteristics,
    };
    const scoreAdjusted = normalizedScore.adjusted;
    const overallSource = scoreAdjusted ? 'server' : 'llm';
    const provider = await getProviderInfo();
    const response = buildAnalysisResponse(analysisResult, provider, {
      usedFallback,
      scoreAdjusted,
      overallSource,
    });
    await sendProgress(context, 'completed', 100);
    return response;
  } catch (error) {
    return createErrorResponse(error, ErrorCode.E_LLM_FAILED, input.prompt);
  }
}

export function registerAnalyzePromptTool(server: McpServer): void {
  server.registerTool(TOOL_NAME, ANALYZE_PROMPT_TOOL, handleAnalyzePrompt);
}
