import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

import {
  ANALYSIS_MAX_TOKENS,
  ANALYSIS_TIMEOUT_MS,
} from '../config/constants.js';
import type { AnalysisResponse, ErrorResponse } from '../config/types.js';
import {
  createErrorResponse,
  createSuccessResponse,
  ErrorCode,
  logger,
} from '../lib/errors.js';
import {
  INPUT_HANDLING_SECTION,
  wrapPromptData,
} from '../lib/prompt-policy.js';
import { getToolContext, type ToolContext } from '../lib/tool-context.js';
import { executeLLMWithJsonResponse } from '../lib/tool-helpers.js';
import { validatePrompt } from '../lib/validation.js';
import {
  AnalyzePromptInputSchema,
  AnalyzePromptOutputSchema,
} from '../schemas/index.js';
import { AnalysisResponseSchema } from '../schemas/llm-responses.js';

const ANALYSIS_SYSTEM_PROMPT = `<role>
You are an expert prompt analyst focused on measurable quality assessment.
</role>

<task>
Score the prompt across clarity, specificity, completeness, structure, and effectiveness.
</task>

${INPUT_HANDLING_SECTION}

<workflow>
1. Read the input prompt.
2. Identify strengths, weaknesses, and missing context.
3. Assign integer scores (0-100) and an overall score.
4. Populate characteristics and 2-3 actionable suggestions.
</workflow>

<scoring>
Each dimension uses an integer score from 0 to 100:
- Clarity: clear language, minimal ambiguity
- Specificity: concrete details and constraints
- Completeness: context, output format, constraints
- Structure: organized layout and flow
- Effectiveness: likelihood of consistent, high-quality responses

Score interpretation:
| Range   | Rating     | Description                       |
|---------|------------|-----------------------------------|
| 80-100  | Excellent  | Production-ready, minimal changes |
| 60-79   | Good       | Functional, minor improvements    |
| 40-59   | Fair       | Needs work, several gaps          |
| 0-39    | Poor       | Major revision required           |
</scoring>

<analysis_checks>
- Vague language or ambiguous references
- Missing role/context/output format/constraints/examples
- Structure (sections, lists, logical order)
- Typos or grammar issues
- Format type (claude xml, gpt markdown, json, auto)
</analysis_checks>

<rules>
ALWAYS:
- Follow the workflow steps in order
- Use only the provided input; do not invent details
- Provide integer scores (no decimals)
- Include 2-3 concise, actionable suggestions
- Set missingContext true when essential context is absent
- Detect format as claude, gpt, json, or auto

ASK:
- If the prompt is vague or incomplete, include "Insufficient context: ..." in suggestions

NEVER:
- Give a perfect 100 unless truly flawless
- Suggest changes that alter the prompt's core intent
- Output anything outside the required JSON schema
</rules>

<output_rules>
Return valid, parseable JSON only. Do not include markdown, code fences, or extra text.
Requirements:
1. Start with { and end with }
2. Use double quotes for all strings
3. No trailing commas
4. Include every required field
5. Use integers for all scores
</output_rules>

<example_json>
{
  "score": {
    "clarity": 85,
    "specificity": 80,
    "completeness": 75,
    "structure": 90,
    "effectiveness": 82,
    "overall": 82
  },
  "characteristics": {
    "hasTypos": false,
    "isVague": true,
    "missingContext": false,
    "hasRoleContext": true,
    "hasExamples": false,
    "hasStructure": true,
    "hasStepByStep": false,
    "wordCount": 156,
    "detectedFormat": "gpt",
    "estimatedComplexity": "moderate"
  },
  "suggestions": [
    "Replace vague terms with specific examples",
    "Add explicit output format requirements",
    "Include clear constraints or requirements"
  ]
}
</example_json>

<schema>
{
  "score": {
    "clarity": number (0-100),
    "specificity": number (0-100),
    "completeness": number (0-100),
    "structure": number (0-100),
    "effectiveness": number (0-100),
    "overall": number (0-100)
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
</schema>

<final_reminder>
Return JSON only. No markdown. No code fences. No extra text.
</final_reminder>`;

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

function formatScoreLines(score: AnalysisResponse['score']): string[] {
  return [
    `## Quality Scores`,
    `- **Clarity**: ${score.clarity}/100`,
    `- **Specificity**: ${score.specificity}/100`,
    `- **Completeness**: ${score.completeness}/100`,
    `- **Structure**: ${score.structure}/100`,
    `- **Effectiveness**: ${score.effectiveness}/100`,
    `- **Overall**: ${score.overall}/100`,
  ];
}

function formatYesNo(label: string, value: boolean): string {
  return `- ${label}: ${value ? 'Yes' : 'No'}`;
}

function formatCharacteristicLines(
  characteristics: AnalysisResponse['characteristics']
): string[] {
  const yesNoEntries: [string, boolean][] = [
    ['Typos detected', characteristics.hasTypos],
    ['Vague language', characteristics.isVague],
    ['Missing context', characteristics.missingContext],
    ['Role defined', characteristics.hasRoleContext],
    ['Examples present', characteristics.hasExamples],
  ];

  return [
    `## Characteristics`,
    ...yesNoEntries.map(([label, value]) => formatYesNo(label, value)),
    `- Word count: ${characteristics.wordCount}`,
  ];
}

function formatSuggestionLines(suggestions: string[]): string[] {
  return [
    `## Improvement Suggestions`,
    suggestions
      .map((suggestion, index) => `${index + 1}. ${suggestion}`)
      .join('\n'),
  ];
}

function formatAnalysisOutput(analysisResult: AnalysisResponse): string {
  return [
    '# Prompt Analysis',
    '',
    ...formatScoreLines(analysisResult.score),
    '',
    ...formatCharacteristicLines(analysisResult.characteristics),
    '',
    ...formatSuggestionLines(analysisResult.suggestions),
  ].join('\n');
}

async function sendProgress(
  context: ToolContext,
  message: string,
  progress: number
): Promise<void> {
  const progressToken = context._meta?.progressToken;
  if (progressToken === undefined) return;

  await context.sendNotification({
    method: 'notifications/progress',
    params: {
      progressToken,
      progress,
      message,
      _meta: {
        tool: 'analyze_prompt',
        requestId: context.requestId,
        sessionId: context.sessionId,
      },
    },
  });
}

function buildAnalysisPrompt(prompt: string): string {
  return `${ANALYSIS_SYSTEM_PROMPT}\n\n<prompt_to_analyze>\n${wrapPromptData(
    prompt
  )}\n</prompt_to_analyze>`;
}

async function runAnalysis(
  analysisPrompt: string,
  signal?: AbortSignal
): Promise<AnalysisResponse> {
  return executeLLMWithJsonResponse<AnalysisResponse>(
    analysisPrompt,
    (value) => AnalysisResponseSchema.parse(value),
    ErrorCode.E_LLM_FAILED,
    'analyze_prompt',
    {
      maxTokens: ANALYSIS_MAX_TOKENS,
      timeoutMs: ANALYSIS_TIMEOUT_MS,
      signal,
    }
  );
}

function buildAnalysisResponse(
  analysisResult: AnalysisResponse
): ReturnType<typeof createSuccessResponse> {
  const output = formatAnalysisOutput(analysisResult);
  return createSuccessResponse(output, {
    ok: true,
    suggestions: analysisResult.suggestions,
    score: analysisResult.score,
    characteristics: analysisResult.characteristics,
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
      'analyze_prompt called'
    );

    const validatedPrompt = validatePrompt(input.prompt);
    await sendProgress(context, 'started', 0);

    const analysisPrompt = buildAnalysisPrompt(validatedPrompt);
    const analysisResult = await runAnalysis(
      analysisPrompt,
      context.request.signal
    );
    return buildAnalysisResponse(analysisResult);
  } catch (error) {
    return createErrorResponse(error, ErrorCode.E_LLM_FAILED, input.prompt);
  }
}

export function registerAnalyzePromptTool(server: McpServer): void {
  server.registerTool(
    'analyze_prompt',
    ANALYZE_PROMPT_TOOL,
    handleAnalyzePrompt
  );
}
