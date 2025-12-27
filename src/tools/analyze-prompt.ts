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
import { getToolContext, type ToolContext } from '../lib/tool-context.js';
import { executeLLMWithJsonResponse } from '../lib/tool-helpers.js';
import { escapePromptForXml, validatePrompt } from '../lib/validation.js';
import {
  AnalyzePromptInputSchema,
  AnalyzePromptOutputSchema,
} from '../schemas/index.js';
import { AnalysisResponseSchema } from '../schemas/llm-responses.js';

const ANALYSIS_SYSTEM_PROMPT = `<role>
You are an expert prompt engineering analyst specializing in prompt quality assessment.
</role>

<task>
Analyze the provided prompt and return quality scores across five dimensions.
</task>

<scoring>
Each dimension uses an integer score from 0 to 100:
1. Clarity - Clear language, minimal ambiguity, no vague terms
2. Specificity - Concrete details, measurable constraints, explicit requirements
3. Completeness - Context provided, output format specified, constraints defined
4. Structure - Organized layout, logical flow, appropriate formatting
5. Effectiveness - Likelihood of producing high-quality, consistent AI responses

Score interpretation:
| Range   | Rating     | Description                        |
|---------|------------|------------------------------------|
| 80-100  | Excellent  | Production-ready, minimal changes  |
| 60-79   | Good       | Functional, minor improvements     |
| 40-59   | Fair       | Needs work, several gaps           |
| 0-39    | Poor       | Major revision required            |
</scoring>

<analysis_checks>
Check for these specific issues:

**Vague language indicators:**
- Generic terms: "something", "stuff", "things", "etc.", "various"
- Ambiguous references: "it", "this", "that" without clear antecedents
- Weak qualifiers: "maybe", "possibly", "might", "kind of"

**Structure indicators:**
- Role/persona definition present
- Clear task statement
- Explicit output format specification
- ALWAYS/NEVER constraints
- Examples or demonstrations
- Reasoning guidance (for complex tasks)

**Quality indicators:**
- Typos and grammar issues
- Word count and complexity level
- Format type (XML, Markdown, plain text)
</analysis_checks>

<rules>
ALWAYS:
- Provide integer scores (no decimals)
- Include at least 2-3 actionable suggestions
- Detect the format type accurately (claude/gpt/json/auto)
- Base scores on objective criteria, not personal preference

NEVER:
- Give a perfect 100 score unless truly flawless
- Suggest changes that alter the prompt's core intent
- Include suggestions that contradict each other
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

const ANALYZE_PROMPT_TOOL = {
  title: 'Analyze Prompt',
  description:
    'Score prompt quality (0-100) across 5 dimensions using AI analysis: clarity, specificity, completeness, structure, effectiveness. Returns actionable suggestions.',
  inputSchema: AnalyzePromptInputSchema.shape,
  outputSchema: AnalyzePromptOutputSchema.shape,
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

    const safePrompt = escapePromptForXml(validatedPrompt);
    const analysisPrompt = buildAnalysisPrompt(safePrompt);
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
