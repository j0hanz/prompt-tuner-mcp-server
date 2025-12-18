import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { OptimizeResponse } from '../config/types.js';
import {
  createErrorResponse,
  createSuccessResponse,
  ErrorCode,
} from '../lib/errors.js';
import { resolveFormat } from '../lib/prompt-analysis.js';
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

const OPTIMIZE_SYSTEM_PROMPT = `You are an expert prompt engineer.

<task>
Apply the requested optimization techniques to improve the prompt.
</task>

<techniques>
Available techniques:

1. basic - Fix grammar, spelling, clarity
2. chainOfThought - Add step-by-step reasoning
3. fewShot - Add 2-3 diverse examples
4. roleBased - Add expert persona
5. structured - Add XML (Claude) or Markdown (GPT)
6. comprehensive - Apply all intelligently
</techniques>

<rules>
ALWAYS:
- Apply techniques in requested order
- Build on previous refinements
- Maintain original intent
- Provide before/after scores
- Return plain text (no markdown code blocks)

NEVER:
- Over-engineer simple prompts
- Wrap output in triple backticks
- Change the core task
</rules>

<scoring>
Score before and after (0-100):
- Clarity
- Specificity
- Completeness
- Structure
- Effectiveness
- Overall (weighted average)
</scoring>

<output>
**CRITICAL: Your response MUST be valid, parseable JSON only. No markdown, no code blocks, no explanatory text.**

1. Start your response with { (opening brace)
2. End your response with } (closing brace)
3. Use proper JSON syntax: double quotes for strings, no trailing commas
4. All required fields MUST be present
5. Do NOT wrap in \`\`\`json code blocks
6. Escape special characters in strings: \\n for newlines, \\" for quotes, \\\\ for backslashes

Example valid response:
{
  "optimized": "You are a senior software engineer. Analyze the code step-by-step:\n\n1. Identify bugs\n2. Suggest improvements\n3. Rate code quality (1-10)",
  "techniquesApplied": ["basic", "roleBased", "structured"],
  "improvements": [
    "Fixed grammar and spelling errors",
    "Added expert role context (senior engineer)",
    "Structured output with numbered steps"
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
</output>

<schema>
{
  "optimized": string (the fully optimized prompt with proper escaping),
  "techniquesApplied": string[] (array of technique names),
  "improvements": string[] (array of changes made),
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
</schema>`;

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

export function registerOptimizePromptTool(server: McpServer): void {
  server.registerTool(
    'optimize_prompt',
    {
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
    },
    async ({
      prompt,
      techniques,
      targetFormat,
    }): Promise<
      | ReturnType<typeof createSuccessResponse>
      | ReturnType<typeof createErrorResponse>
    > => {
      try {
        const validatedPrompt = validatePrompt(prompt);
        const validatedTechniques = validateTechniques(techniques);
        const validatedFormat = validateFormat(targetFormat);
        const resolvedFormat = resolveFormat(validatedFormat, validatedPrompt);

        const optimizePrompt = `${OPTIMIZE_SYSTEM_PROMPT}\n\nTarget Format: ${resolvedFormat}\nTechniques to apply: ${validatedTechniques.join(', ')}\n\nORIGINAL PROMPT:\n${validatedPrompt}`;

        const optimizationResult =
          await executeLLMWithJsonResponse<OptimizeResponse>(
            optimizePrompt,
            (value) => OptimizeResponseSchema.parse(value),
            ErrorCode.E_LLM_FAILED,
            'optimize_prompt',
            { maxTokens: 3000, timeoutMs: 60000 }
          );

        const scoreDiff =
          optimizationResult.afterScore.overall -
          optimizationResult.beforeScore.overall;
        if (scoreDiff > 0) {
          optimizationResult.improvements.push(
            `Overall score improved by ${scoreDiff} points`
          );
        }

        const output = formatOptimizeOutput(optimizationResult);

        return createSuccessResponse(output, {
          ok: true,
          original: validatedPrompt,
          optimized: optimizationResult.optimized,
          techniquesApplied: optimizationResult.techniquesApplied,
          targetFormat: resolvedFormat,
          beforeScore: optimizationResult.beforeScore,
          afterScore: optimizationResult.afterScore,
          improvements: optimizationResult.improvements,
          usedFallback: false,
        });
      } catch (error) {
        return createErrorResponse(error, ErrorCode.E_LLM_FAILED, prompt);
      }
    }
  );
}
