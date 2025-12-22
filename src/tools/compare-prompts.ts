import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ComparisonResponse } from '../config/types.js';
import {
  createErrorResponse,
  createSuccessResponse,
  ErrorCode,
} from '../lib/errors.js';
import { executeLLMWithJsonResponse } from '../lib/tool-helpers.js';
import { validatePrompt } from '../lib/validation.js';
import {
  ComparePromptsInputSchema,
  ComparePromptsOutputSchema,
} from '../schemas/index.js';
import { ComparisonResponseSchema } from '../schemas/llm-responses.js';

const COMPARE_SYSTEM_PROMPT = `You are an expert prompt evaluator.

<task>
Compare two prompts and determine which is better across 5 dimensions.
</task>

<criteria>
Evaluate each prompt on:

1. Clarity - Clearer, less vague language
2. Specificity - More concrete details
3. Completeness - Better context and requirements
4. Structure - Better organization
5. Effectiveness - Likely to produce better responses

Provide scores (0-100) for each dimension and overall.
</criteria>

<output>
**CRITICAL: Your response MUST be valid, parseable JSON only. No markdown, no code blocks, no explanatory text.**

1. Start your response with { (opening brace)
2. End your response with } (closing brace)
3. Use proper JSON syntax: double quotes for strings, no trailing commas
4. All required fields MUST be present
5. Do NOT wrap in \`\`\`json code blocks

Example valid response:
{
  "scoreA": {
    "clarity": 70,
    "specificity": 65,
    "completeness": 60,
    "structure": 55,
    "effectiveness": 62,
    "overall": 62
  },
  "scoreB": {
    "clarity": 90,
    "specificity": 88,
    "completeness": 85,
    "structure": 92,
    "effectiveness": 89,
    "overall": 89
  },
  "winner": "B",
  "improvements": [
    "Added clear role definition (senior engineer)",
    "Structured with numbered steps",
    "Included specific output requirements"
  ],
  "regressions": [],
  "recommendation": "Prompt B is significantly better due to clear structure and role definition. Consider adopting this approach."
}
</output>

<schema>
{
  "scoreA": {"clarity": 0-100, "specificity": 0-100, "completeness": 0-100, "structure": 0-100, "effectiveness": 0-100, "overall": 0-100},
  "scoreB": {"clarity": 0-100, "specificity": 0-100, "completeness": 0-100, "structure": 0-100, "effectiveness": 0-100, "overall": 0-100},
  "winner": "A" | "B" | "tie",
  "improvements": string[] (what's better in B),
  "regressions": string[] (what's worse in B),
  "recommendation": string (actionable advice)
}
</schema>`;

interface ComparePromptsInput {
  promptA: string;
  promptB: string;
  labelA?: string;
  labelB?: string;
}

const COMPARE_PROMPTS_TOOL = {
  title: 'Compare Prompts',
  description:
    'Compare two prompt versions using AI analysis. Returns scores, winner, improvements/regressions, and recommendations.',
  inputSchema: ComparePromptsInputSchema,
  outputSchema: ComparePromptsOutputSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
};

function formatScoreSection(
  label: string,
  score: ComparisonResponse['scoreA']
): string[] {
  return [
    `## ${label}: Score ${score.overall}/100`,
    `- Clarity: ${score.clarity}`,
    `- Specificity: ${score.specificity}`,
    `- Completeness: ${score.completeness}`,
    `- Structure: ${score.structure}`,
    `- Effectiveness: ${score.effectiveness}`,
  ];
}

function formatListSection(title: string, items: string[]): string[] {
  if (items.length === 0) return [title, '- None'];
  return [title, items.map((item) => `- ${item}`).join('\n')];
}

function formatWinnerLabel(
  parsed: ComparisonResponse,
  labelA: string,
  labelB: string
): string {
  if (parsed.winner === 'tie') return 'Tie';
  return parsed.winner === 'A' ? labelA : labelB;
}

function formatComparisonOutput(
  labelA: string,
  labelB: string,
  parsed: ComparisonResponse
): string {
  const sections = [
    '# Prompt Comparison',
    '',
    ...formatScoreSection(labelA, parsed.scoreA),
    '',
    ...formatScoreSection(labelB, parsed.scoreB),
    '',
    `## Winner: ${formatWinnerLabel(parsed, labelA, labelB)}`,
    '',
    ...formatListSection(`## Improvements in ${labelB}`, parsed.improvements),
  ];

  if (parsed.regressions.length > 0) {
    sections.push(
      '',
      ...formatListSection(`## Regressions in ${labelB}`, parsed.regressions)
    );
  }

  sections.push('', '## Recommendation', parsed.recommendation);
  return sections.join('\n');
}

function buildScoreDelta(
  parsed: ComparisonResponse
): ComparisonResponse['scoreA'] {
  return {
    clarity: parsed.scoreB.clarity - parsed.scoreA.clarity,
    specificity: parsed.scoreB.specificity - parsed.scoreA.specificity,
    completeness: parsed.scoreB.completeness - parsed.scoreA.completeness,
    structure: parsed.scoreB.structure - parsed.scoreA.structure,
    effectiveness: parsed.scoreB.effectiveness - parsed.scoreA.effectiveness,
    overall: parsed.scoreB.overall - parsed.scoreA.overall,
  };
}

function resolveLabels(input: ComparePromptsInput): {
  labelA: string;
  labelB: string;
} {
  return {
    labelA: input.labelA ?? 'Prompt A',
    labelB: input.labelB ?? 'Prompt B',
  };
}

function buildComparePrompt(
  labelA: string,
  labelB: string,
  promptA: string,
  promptB: string
): string {
  return `${COMPARE_SYSTEM_PROMPT}\n\n${labelA}:\n${promptA}\n\n${labelB}:\n${promptB}`;
}

async function runComparison(
  comparePrompt: string
): Promise<ComparisonResponse> {
  return executeLLMWithJsonResponse<ComparisonResponse>(
    comparePrompt,
    (value: unknown) => ComparisonResponseSchema.parse(value),
    ErrorCode.E_LLM_FAILED,
    'compare_prompts',
    { maxTokens: 1500 }
  );
}

function buildCompareResponse(
  parsed: ComparisonResponse,
  validatedA: string,
  validatedB: string,
  labelA: string,
  labelB: string
): ReturnType<typeof createSuccessResponse> {
  const output = formatComparisonOutput(labelA, labelB, parsed);
  return createSuccessResponse(output, {
    ok: true,
    promptA: validatedA,
    promptB: validatedB,
    scoreA: parsed.scoreA,
    scoreB: parsed.scoreB,
    scoreDelta: buildScoreDelta(parsed),
    winner: parsed.winner,
    improvements: parsed.improvements,
    regressions: parsed.regressions,
    recommendation: parsed.recommendation,
  });
}

async function handleComparePrompts(
  input: ComparePromptsInput
): Promise<
  | ReturnType<typeof createSuccessResponse>
  | ReturnType<typeof createErrorResponse>
> {
  try {
    return await runCompareFlow(input);
  } catch (error) {
    return createErrorResponse(
      error,
      ErrorCode.E_LLM_FAILED,
      `${input.promptA} | ${input.promptB}`
    );
  }
}

async function runCompareFlow(
  input: ComparePromptsInput
): Promise<ReturnType<typeof createSuccessResponse>> {
  const validatedA = validatePrompt(input.promptA);
  const validatedB = validatePrompt(input.promptB);
  const { labelA, labelB } = resolveLabels(input);
  const comparePrompt = buildComparePrompt(
    labelA,
    labelB,
    validatedA,
    validatedB
  );
  const parsed = await runComparison(comparePrompt);
  return buildCompareResponse(parsed, validatedA, validatedB, labelA, labelB);
}

// Registers the compare_prompts tool with the MCP server
export function registerComparePromptsTool(server: McpServer): void {
  server.registerTool(
    'compare_prompts',
    COMPARE_PROMPTS_TOOL,
    handleComparePrompts
  );
}
