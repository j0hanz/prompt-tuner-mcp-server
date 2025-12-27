import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

import type { ComparisonResponse, ErrorResponse } from '../config/types.js';
import {
  createErrorResponse,
  createSuccessResponse,
  ErrorCode,
} from '../lib/errors.js';
import {
  INPUT_HANDLING_SECTION,
  wrapPromptData,
} from '../lib/prompt-policy.js';
import { getToolContext } from '../lib/tool-context.js';
import { executeLLMWithJsonResponse } from '../lib/tool-helpers.js';
import { validatePrompt } from '../lib/validation.js';
import {
  ComparePromptsInputSchema,
  ComparePromptsOutputSchema,
} from '../schemas/index.js';
import { ComparisonResponseSchema } from '../schemas/llm-responses.js';

const COMPARE_SYSTEM_PROMPT = `<role>
You are an expert prompt evaluator specializing in comparative analysis.
</role>

<task>
Compare two prompts and determine which is more effective across five dimensions.
</task>

${INPUT_HANDLING_SECTION}

<workflow>
1. Read Prompt A and Prompt B.
2. Score each prompt across the five dimensions.
3. Decide a winner or a tie (<=2 overall points).
4. List improvements/regressions and give a clear recommendation.
</workflow>

<criteria>
Score each prompt from 0 to 100 for:
- Clarity: unambiguous language, no vague terms
- Specificity: concrete details and constraints
- Completeness: context, requirements, output format
- Structure: organization and logical flow
- Effectiveness: likelihood of consistent, high-quality responses
</criteria>

<edge_cases>
- Identical prompts: same scores, winner "tie", no improvements/regressions
- Different goals: score each prompt by how well it meets its own goal
- Length differences: do not favor longer prompts
</edge_cases>

<rules>
ALWAYS:
- Follow the workflow steps in order
- Use only the provided inputs; do not invent details
- Use integer scores only (no decimals)
- If overall scores differ by 2 points or less, return "tie"
- "improvements" lists what Prompt B does better than Prompt A
- "regressions" lists what Prompt B does worse than Prompt A
- List at least one improvement or regression unless prompts are identical
- Keep improvements/regressions short and actionable (5-15 words)

ASK:
- If a prompt lacks essential context, note "Insufficient context: ..." in recommendation

NEVER:
- Let length bias the comparison
- Provide vague recommendations like "make it better"
- Output anything outside the required JSON schema
</rules>

<output_rules>
Return valid JSON only. No markdown, no code fences, or extra text.
Requirements:
1. Start with { and end with }
2. Double quotes for all strings
3. No trailing commas
4. Include every required field
</output_rules>

<example_json>
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
    "Adds a clear expert role",
    "Introduces explicit output format",
    "Uses numbered steps for structure"
  ],
  "regressions": [],
  "recommendation": "Adopt prompt B and keep its structured sections and explicit output format."
}
</example_json>

<schema>
{
  "scoreA": {"clarity": 0-100, "specificity": 0-100, "completeness": 0-100, "structure": 0-100, "effectiveness": 0-100, "overall": 0-100},
  "scoreB": {"clarity": 0-100, "specificity": 0-100, "completeness": 0-100, "structure": 0-100, "effectiveness": 0-100, "overall": 0-100},
  "winner": "A" | "B" | "tie",
  "improvements": string[],
  "regressions": string[],
  "recommendation": string
}
</schema>

<final_reminder>
Return JSON only. No markdown. No code fences. No extra text.
</final_reminder>`;

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
  inputSchema: ComparePromptsInputSchema.shape,
  outputSchema: ComparePromptsOutputSchema.shape,
  annotations: {
    readOnlyHint: true,
    idempotentHint: false,
    openWorldHint: true,
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

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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
  const safeLabelA = escapeXmlAttribute(labelA);
  const safeLabelB = escapeXmlAttribute(labelB);
  return `${COMPARE_SYSTEM_PROMPT}\n\n<prompt_a label="${safeLabelA}">\n${wrapPromptData(
    promptA
  )}\n</prompt_a>\n\n<prompt_b label="${safeLabelB}">\n${wrapPromptData(
    promptB
  )}\n</prompt_b>`;
}

async function runComparison(
  comparePrompt: string,
  signal: AbortSignal
): Promise<ComparisonResponse> {
  return executeLLMWithJsonResponse<ComparisonResponse>(
    comparePrompt,
    (value: unknown) => ComparisonResponseSchema.parse(value),
    ErrorCode.E_LLM_FAILED,
    'compare_prompts',
    { maxTokens: 1500, signal }
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
  input: ComparePromptsInput,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<ReturnType<typeof createSuccessResponse> | ErrorResponse> {
  const context = getToolContext(extra);

  try {
    return await runCompareFlow(input, context.request.signal);
  } catch (error) {
    return createErrorResponse(
      error,
      ErrorCode.E_LLM_FAILED,
      `${input.promptA} | ${input.promptB}`
    );
  }
}

async function runCompareFlow(
  input: ComparePromptsInput,
  signal: AbortSignal
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
  const parsed = await runComparison(comparePrompt, signal);
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
