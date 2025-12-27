import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

import type {
  ErrorResponse,
  OptimizationTechnique,
  OptimizeResponse,
  TargetFormat,
} from '../config/types.js';
import {
  createErrorResponse,
  createSuccessResponse,
  ErrorCode,
} from '../lib/errors.js';
import { resolveFormat } from '../lib/prompt-analysis.js';
import {
  INPUT_HANDLING_SECTION,
  wrapPromptData,
} from '../lib/prompt-policy.js';
import { getToolContext } from '../lib/tool-context.js';
import { executeLLMWithJsonResponse } from '../lib/tool-helpers.js';
import {
  validateFormat,
  validatePrompt,
  validateTechniques,
} from '../lib/validation.js';
import {
  OptimizePromptInputSchema,
  OptimizePromptOutputSchema,
} from '../schemas/index.js';
import { OptimizeResponseSchema } from '../schemas/llm-responses.js';

const OPTIMIZE_SYSTEM_PROMPT = `<role>
You are an expert prompt engineer specializing in prompt optimization.
</role>

<task>
Apply the requested optimization techniques to improve the prompt's effectiveness.
</task>

${INPUT_HANDLING_SECTION}

<workflow>
1. Read the input prompt.
2. Apply techniques in the requested order, skipping any that add no value.
3. Keep the prompt aligned to the target format.
4. Produce before/after scores and list improvements.
</workflow>

<techniques>
| Technique       | Purpose                                      | When to Apply                         |
|-----------------|----------------------------------------------|---------------------------------------|
| basic           | Fix grammar, clarity, vague words           | Always beneficial                     |
| chainOfThought  | Add reasoning triggers                       | Complex reasoning, debugging          |
| fewShot         | Add 2-3 diverse examples                     | Classification, formatting, patterns  |
| roleBased       | Add expert persona                            | Domain expertise needed               |
| structured      | Add XML/Markdown structure                   | Multi-part or complex tasks           |
| comprehensive   | Apply multiple techniques intelligently      | Significant improvement needed        |
</techniques>

<rules>
ALWAYS:
- Follow the workflow steps in order
- Preserve the original intent and task boundaries
- Match the optimized prompt to the target format
- Use integer scores only (no decimals)
- List only techniques actually applied

ASK:
- If essential context is missing, note "Insufficient context: ..." in improvements

NEVER:
- Over-engineer simple prompts
- Add requirements not implied by the original
- Mix XML and Markdown in the same prompt
- Output anything outside the required JSON schema
</rules>

<scoring>
Provide integer scores from 0 to 100 for:
- Clarity
- Specificity
- Completeness
- Structure
- Effectiveness
- Overall (weighted average)
</scoring>

<output_rules>
Return valid, parseable JSON only. Do not include markdown, code fences, or extra text.
Requirements:
1. Start with { and end with }
2. Double quotes for all strings
3. No trailing commas
4. Include every required field
5. Escape special characters in strings: \\n for newlines, \\" for quotes, \\\\ for backslashes
</output_rules>

<example_json>
{
  "optimized": "You are a senior software engineer. Analyze the code step by step:\\n\\n1. Identify bugs\\n2. Suggest improvements\\n3. Rate code quality (1-10)",
  "techniquesApplied": ["basic", "roleBased", "structured"],
  "improvements": [
    "Fixed grammar and clarity issues",
    "Added a specific expert role",
    "Organized the prompt into structured steps"
  ],
  "beforeScore": {
    "clarity": 60,
    "specificity": 55,
    "completeness": 50,
    "structure": 40,
    "effectiveness": 52,
    "overall": 51
  },
  "afterScore": {
    "clarity": 90,
    "specificity": 85,
    "completeness": 88,
    "structure": 95,
    "effectiveness": 89,
    "overall": 89
  }
}
</example_json>

<schema>
{
  "optimized": string,
  "techniquesApplied": string[],
  "improvements": string[],
  "beforeScore": {
    "clarity": number (0-100),
    "specificity": number (0-100),
    "completeness": number (0-100),
    "structure": number (0-100),
    "effectiveness": number (0-100),
    "overall": number (0-100)
  },
  "afterScore": {
    "clarity": number (0-100),
    "specificity": number (0-100),
    "completeness": number (0-100),
    "structure": number (0-100),
    "effectiveness": number (0-100),
    "overall": number (0-100)
  }
}
</schema>

<final_reminder>
Return JSON only. No markdown. No code fences. No extra text.
</final_reminder>`;

function formatScoreSection(
  label: string,
  score: OptimizeResponse['beforeScore']
): string {
  return [
    `## ${label}: ${score.overall}/100`,
    `- Clarity: ${score.clarity}`,
    `- Specificity: ${score.specificity}`,
    `- Completeness: ${score.completeness}`,
    `- Structure: ${score.structure}`,
    `- Effectiveness: ${score.effectiveness}`,
  ].join('\n');
}

function buildScoreDeltaSection(scoreDelta: number): string[] {
  if (scoreDelta === 0) {
    return ['## Score Delta', '- Overall score unchanged'];
  }

  const direction = scoreDelta > 0 ? 'improved' : 'decreased';
  return [
    '## Score Delta',
    `- Overall score ${direction} by ${Math.abs(scoreDelta)} point${
      Math.abs(scoreDelta) === 1 ? '' : 's'
    }`,
  ];
}

function formatOptimizeOutput(
  optimizationResult: OptimizeResponse,
  scoreDelta: number
): string {
  return [
    `# Optimization Results`,
    ``,
    formatScoreSection('Before Score', optimizationResult.beforeScore),
    ``,
    formatScoreSection('After Score', optimizationResult.afterScore),
    ``,
    ...buildScoreDeltaSection(scoreDelta),
    ``,
    `## Techniques Applied`,
    optimizationResult.techniquesApplied
      .map((technique) => `- ${technique}`)
      .join('\n'),
    ``,
    `## Improvements`,
    optimizationResult.improvements
      .map((improvement) => `- ${improvement}`)
      .join('\n'),
    ``,
    `## Optimized Prompt`,
    '```',
    optimizationResult.optimized,
    '```',
  ].join('\n');
}

interface OptimizePromptInput {
  prompt: string;
  techniques?: string[];
  targetFormat?: string;
}

interface ResolvedOptimizeInputs {
  validatedPrompt: string;
  validatedTechniques: OptimizationTechnique[];
  resolvedFormat: TargetFormat;
}

const OPTIMIZE_PROMPT_TOOL = {
  title: 'Optimize Prompt',
  description:
    'Apply multiple optimization techniques using AI (e.g., ["basic", "roleBased", "structured"]). Returns before/after scores and improvements.',
  inputSchema: OptimizePromptInputSchema.shape,
  outputSchema: OptimizePromptOutputSchema.shape,
  annotations: {
    readOnlyHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
};

function buildOptimizePrompt(
  prompt: string,
  resolvedFormat: TargetFormat,
  techniques: OptimizationTechnique[]
): string {
  return `${OPTIMIZE_SYSTEM_PROMPT}\n\nTarget Format: ${resolvedFormat}\nTechniques to apply: ${techniques.join(
    ', '
  )}\n\n<original_prompt>\n${wrapPromptData(prompt)}\n</original_prompt>`;
}

function resolveOptimizeInputs(
  input: OptimizePromptInput
): ResolvedOptimizeInputs {
  const validatedPrompt = validatePrompt(input.prompt);
  const techniques = input.techniques ?? ['basic'];
  const targetFormat = input.targetFormat ?? 'auto';
  const validatedTechniques = validateTechniques(techniques);
  const validatedFormat = validateFormat(targetFormat);
  const resolvedFormat = resolveFormat(validatedFormat, validatedPrompt);
  return { validatedPrompt, validatedTechniques, resolvedFormat };
}

async function runOptimization(
  optimizePrompt: string,
  signal: AbortSignal
): Promise<OptimizeResponse> {
  return executeLLMWithJsonResponse<OptimizeResponse>(
    optimizePrompt,
    (value) => OptimizeResponseSchema.parse(value),
    ErrorCode.E_LLM_FAILED,
    'optimize_prompt',
    { maxTokens: 3000, timeoutMs: 60000, signal }
  );
}

function buildOptimizeResponse(
  result: OptimizeResponse,
  original: string,
  targetFormat: TargetFormat
): ReturnType<typeof createSuccessResponse> {
  const scoreDelta = result.afterScore.overall - result.beforeScore.overall;
  const output = formatOptimizeOutput(result, scoreDelta);
  return createSuccessResponse(output, {
    ok: true,
    original,
    optimized: result.optimized,
    techniquesApplied: result.techniquesApplied,
    targetFormat,
    beforeScore: result.beforeScore,
    afterScore: result.afterScore,
    improvements: result.improvements,
    usedFallback: false,
    scoreDelta,
  });
}

async function handleOptimizePrompt(
  input: OptimizePromptInput,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<ReturnType<typeof createSuccessResponse> | ErrorResponse> {
  const context = getToolContext(extra);

  try {
    const resolved = resolveOptimizeInputs(input);
    const optimizePrompt = buildOptimizePrompt(
      resolved.validatedPrompt,
      resolved.resolvedFormat,
      resolved.validatedTechniques
    );
    const optimizationResult = await runOptimization(
      optimizePrompt,
      context.request.signal
    );
    return buildOptimizeResponse(
      optimizationResult,
      resolved.validatedPrompt,
      resolved.resolvedFormat
    );
  } catch (error) {
    return createErrorResponse(error, ErrorCode.E_LLM_FAILED, input.prompt);
  }
}

export function registerOptimizePromptTool(server: McpServer): void {
  server.registerTool(
    'optimize_prompt',
    OPTIMIZE_PROMPT_TOOL,
    handleOptimizePrompt
  );
}
