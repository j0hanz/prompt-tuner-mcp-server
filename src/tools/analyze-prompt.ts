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

const ANALYSIS_SYSTEM_PROMPT = `You are an expert prompt engineering analyst.

<task>
Analyze the provided prompt and return quality scores across 5 dimensions.
</task>

<scoring>
Each dimension scored 0-100:

1. Clarity - Clear language, no vague terms
2. Specificity - Concrete details, examples, numbers
3. Completeness - Context, requirements, output format specified
4. Structure - Organization, formatting, logical flow
5. Effectiveness - Likelihood of good AI responses

Score ranges:
- 80-100: Excellent
- 60-79: Good
- 40-59: Fair
- 0-39: Needs work
</scoring>

<checklist>
When analyzing, check for:
- Detect typos and grammar issues
- Vague language ("something", "stuff", "things")
- Role/persona definition
- Examples or demonstrations
- Structure (XML, Markdown, or plain)
- Output format specification
- Reasoning guidance
- Word count and complexity
</checklist>

<output>
**CRITICAL: Your response MUST be valid, parseable JSON only. No markdown, no code blocks, no explanatory text.**

1. Start your response with { (opening brace)
2. End your response with } (closing brace)
3. Use proper JSON syntax: double quotes for strings, no trailing commas
4. All required fields MUST be present
5. Do NOT wrap in \`\`\`json code blocks

Example valid response:
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
    "Replace vague terms like 'something' with specific examples",
    "Add 2-3 concrete examples of expected output format",
    "Include specific constraints or requirements"
  ]
}
</output>

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
  "suggestions": string[] (array of actionable improvement recommendations)
}
</schema>`;

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
  return `${ANALYSIS_SYSTEM_PROMPT}\n\nPROMPT TO ANALYZE:\n${prompt}`;
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
