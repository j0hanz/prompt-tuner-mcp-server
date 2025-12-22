import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type {
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
import { executeLLMWithJsonResponse } from '../lib/tool-helpers.js';
import {
  escapePromptForXml,
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
You are an expert prompt engineer.
</role>

<task>
Apply the requested optimization techniques to improve the prompt.
</task>

<techniques>
Available techniques:
1. basic - Fix grammar, spelling, clarity
2. chainOfThought - Add step-by-step reasoning guidance
3. fewShot - Add 2-3 diverse examples
4. roleBased - Add an expert persona
5. structured - Add XML (Claude) or Markdown (GPT) structure
6. comprehensive - Apply all techniques intelligently
</techniques>

<rules>
ALWAYS:
- Apply techniques in the requested order and build on previous refinements
- Preserve the original intent and task boundaries
- Match the optimized prompt to the target format
- Provide before and after scores

NEVER:
- Over-engineer simple prompts
- Change the core task or add unrelated requirements
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

function formatOptimizeOutput(optimizationResult: OptimizeResponse): string {
  return [
    `# Optimization Results`,
    ``,
    formatScoreSection('Before Score', optimizationResult.beforeScore),
    ``,
    formatScoreSection('After Score', optimizationResult.afterScore),
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
  inputSchema: OptimizePromptInputSchema,
  outputSchema: OptimizePromptOutputSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
};

function buildOptimizePrompt(
  prompt: string,
  resolvedFormat: TargetFormat,
  techniques: OptimizationTechnique[]
): string {
  return `${OPTIMIZE_SYSTEM_PROMPT}\n\nTarget Format: ${resolvedFormat}\nTechniques to apply: ${techniques.join(
    ', '
  )}\n\n<original_prompt>\n${prompt}\n</original_prompt>`;
}

function appendScoreImprovement(result: OptimizeResponse): void {
  const scoreDiff = result.afterScore.overall - result.beforeScore.overall;
  if (scoreDiff > 0) {
    result.improvements.push(`Overall score improved by ${scoreDiff} points`);
  }
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
  optimizePrompt: string
): Promise<OptimizeResponse> {
  return executeLLMWithJsonResponse<OptimizeResponse>(
    optimizePrompt,
    (value) => OptimizeResponseSchema.parse(value),
    ErrorCode.E_LLM_FAILED,
    'optimize_prompt',
    { maxTokens: 3000, timeoutMs: 60000 }
  );
}

function buildOptimizeResponse(
  result: OptimizeResponse,
  original: string,
  targetFormat: TargetFormat
): ReturnType<typeof createSuccessResponse> {
  const output = formatOptimizeOutput(result);
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
  });
}

async function handleOptimizePrompt(
  input: OptimizePromptInput
): Promise<
  | ReturnType<typeof createSuccessResponse>
  | ReturnType<typeof createErrorResponse>
> {
  try {
    const resolved = resolveOptimizeInputs(input);
    const safePrompt = escapePromptForXml(resolved.validatedPrompt);
    const optimizePrompt = buildOptimizePrompt(
      safePrompt,
      resolved.resolvedFormat,
      resolved.validatedTechniques
    );
    const optimizationResult = await runOptimization(optimizePrompt);

    appendScoreImprovement(optimizationResult);
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
