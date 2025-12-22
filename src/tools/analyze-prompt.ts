import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
  ANALYSIS_MAX_TOKENS,
  ANALYSIS_TIMEOUT_MS,
} from '../config/constants.js';
import type { AnalysisResponse } from '../config/types.js';
import {
  createErrorResponse,
  createSuccessResponse,
  ErrorCode,
  logger,
} from '../lib/errors.js';
import { executeLLMWithJsonResponse } from '../lib/tool-helpers.js';
import { validatePrompt } from '../lib/validation.js';
import {
  AnalyzePromptInputSchema,
  AnalyzePromptOutputSchema,
} from '../schemas/index.js';
import { AnalysisResponseSchema } from '../schemas/llm-responses.js';

const ANALYSIS_SYSTEM_PROMPT = `<role>
You are an expert prompt engineering analyst.
</role>

<task>
Analyze the provided prompt and return quality scores across five dimensions.
</task>

<scoring>
Each dimension uses an integer score from 0 to 100:
1. Clarity - Clear language, minimal ambiguity or vagueness
2. Specificity - Concrete details, examples, or measurable constraints
3. Completeness - Context, requirements, and output format are specified
4. Structure - Organized layout and logical flow
5. Effectiveness - Likelihood of producing high-quality AI responses

Score ranges:
80-100 Excellent
60-79 Good
40-59 Fair
0-39 Needs work
</scoring>

<analysis_checks>
Check for:
- Typos and grammar issues
- Vague language (for example: "something", "stuff", "things")
- Role or persona definition
- Examples or demonstrations
- Structure (XML, Markdown, or plain text)
- Output format specification
- Reasoning guidance, if appropriate
- Word count and complexity
</analysis_checks>

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
    "Add concrete output format requirements",
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

interface AnalyzePromptExtra {
  sessionId?: string;
  signal?: AbortSignal;
  sendNotification?: (params: unknown) => Promise<void>;
}

const ANALYZE_PROMPT_TOOL = {
  title: 'Analyze Prompt',
  description:
    'Score prompt quality (0-100) across 5 dimensions using AI analysis: clarity, specificity, completeness, structure, effectiveness. Returns actionable suggestions.',
  inputSchema: AnalyzePromptInputSchema,
  outputSchema: AnalyzePromptOutputSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: false,
    openWorldHint: false,
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
  extra: AnalyzePromptExtra,
  message: string,
  progress: number
): Promise<void> {
  if (typeof extra.sendNotification !== 'function') return;
  await extra.sendNotification({
    method: 'notifications/progress',
    params: {
      progressToken: `analyze_prompt:${extra.sessionId ?? 'unknown'}`,
      progress,
      message,
      _meta: { tool: 'analyze_prompt', sessionId: extra.sessionId },
    },
  });
}

function buildAnalysisPrompt(prompt: string): string {
  return `${ANALYSIS_SYSTEM_PROMPT}\n\n<prompt_to_analyze>\n${prompt}\n</prompt_to_analyze>`;
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
    ...analysisResult.characteristics,
    suggestions: analysisResult.suggestions,
    score: analysisResult.score,
    characteristics: analysisResult.characteristics,
  });
}

async function handleAnalyzePrompt(
  input: AnalyzePromptInput,
  extra: unknown
): Promise<
  | ReturnType<typeof createSuccessResponse>
  | ReturnType<typeof createErrorResponse>
> {
  try {
    const context = extra as AnalyzePromptExtra;
    logger.info(
      { sessionId: context.sessionId, promptLength: input.prompt.length },
      'analyze_prompt called'
    );

    const validatedPrompt = validatePrompt(input.prompt);
    await sendProgress(context, 'started', 0);

    const analysisPrompt = buildAnalysisPrompt(validatedPrompt);
    const analysisResult = await runAnalysis(analysisPrompt, context.signal);
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
