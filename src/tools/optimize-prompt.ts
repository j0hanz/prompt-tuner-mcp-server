import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

import {
  OPTIMIZE_MAX_TOKENS,
  OPTIMIZE_TIMEOUT_MS,
} from '../config/constants.js';
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
import { getProviderInfo } from '../lib/llm-client.js';
import { resolveFormat } from '../lib/prompt-analysis.js';
import {
  INPUT_HANDLING_SECTION,
  wrapPromptData,
} from '../lib/prompt-policy.js';
import { getToolContext } from '../lib/tool-context.js';
import {
  asBulletList,
  asCodeBlock,
  buildOutput,
  formatProviderLine,
} from '../lib/tool-formatters.js';
import { executeLLMWithJsonResponse } from '../lib/tool-helpers.js';
import { buildPromptResourceBlock } from '../lib/tool-resources.js';
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
import { formatImprovements } from './optimize-prompt/formatters.js';

const OPTIMIZE_SYSTEM_PROMPT = `<role>
You are an expert prompt optimizer.
</role>

<task>
Improve the prompt using the requested techniques while preserving intent and target format.
</task>

${INPUT_HANDLING_SECTION}

<requirements>
- Apply techniques in the given order; skip any that add no value
- Keep output aligned to the target format
- Provide before/after integer scores (0-100) and list improvements
- List only techniques actually applied
- Prefix each improvement with its technique (e.g., "basic: ...")
- If essential context is missing, include "Insufficient context: ..." in improvements
</requirements>

<techniques>
basic, chainOfThought, fewShot, roleBased, structured, comprehensive
</techniques>

<output_rules>
Return JSON only. No markdown or extra text.
</output_rules>

<schema>
{
  "optimized": string,
  "techniquesApplied": string[],
  "improvements": string[],
  "beforeScore": {
    "clarity": number,
    "specificity": number,
    "completeness": number,
    "structure": number,
    "effectiveness": number,
    "overall": number
  },
  "afterScore": {
    "clarity": number,
    "specificity": number,
    "completeness": number,
    "structure": number,
    "effectiveness": number,
    "overall": number
  }
}
</schema>`;

const TOOL_NAME = 'optimize_prompt' as const;

function formatScoreLines(
  before: OptimizeResponse['beforeScore'],
  after: OptimizeResponse['afterScore']
): string[] {
  const delta = after.overall - before.overall;
  const deltaText =
    delta === 0 ? 'Delta: 0' : `Delta: ${delta > 0 ? '+' : ''}${delta}`;

  const beforeLine = `Before: ${before.overall}/100 (clarity ${before.clarity}, specificity ${before.specificity}, completeness ${before.completeness}, structure ${before.structure}, effectiveness ${before.effectiveness})`;
  const afterLine = `After: ${after.overall}/100 (clarity ${after.clarity}, specificity ${after.specificity}, completeness ${after.completeness}, structure ${after.structure}, effectiveness ${after.effectiveness})`;

  return asBulletList([beforeLine, afterLine, deltaText]);
}

function formatOptimizeOutput(
  optimizationResult: OptimizeResponse,
  targetFormat: TargetFormat,
  provider: { provider: string; model: string }
): string {
  const meta = [formatProviderLine(provider), `Target format: ${targetFormat}`];

  return buildOutput('Prompt Optimization', meta, [
    {
      title: 'Scores',
      lines: formatScoreLines(
        optimizationResult.beforeScore,
        optimizationResult.afterScore
      ),
    },
    {
      title: 'Techniques Applied',
      lines: asBulletList(optimizationResult.techniquesApplied),
    },
    {
      title: 'Improvements',
      lines: formatImprovements(optimizationResult.improvements),
    },
    {
      title: 'Optimized Prompt',
      lines: asCodeBlock(optimizationResult.optimized),
    },
  ]);
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
    TOOL_NAME,
    { maxTokens: OPTIMIZE_MAX_TOKENS, timeoutMs: OPTIMIZE_TIMEOUT_MS, signal }
  );
}

function buildOptimizeResponse(
  result: OptimizeResponse,
  original: string,
  targetFormat: TargetFormat,
  provider: { provider: string; model: string }
): ReturnType<typeof createSuccessResponse> {
  const scoreDelta = result.afterScore.overall - result.beforeScore.overall;
  const output = formatOptimizeOutput(result, targetFormat, provider);
  const promptResource = buildPromptResourceBlock(
    result.optimized,
    `optimized-prompt-${targetFormat}`
  );
  return createSuccessResponse(
    output,
    {
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
      provider: provider.provider,
      model: provider.model,
    },
    [promptResource]
  );
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
    const provider = await getProviderInfo();
    return buildOptimizeResponse(
      optimizationResult,
      resolved.validatedPrompt,
      resolved.resolvedFormat,
      provider
    );
  } catch (error) {
    return createErrorResponse(error, ErrorCode.E_LLM_FAILED, input.prompt);
  }
}

export function registerOptimizePromptTool(server: McpServer): void {
  server.registerTool(TOOL_NAME, OPTIMIZE_PROMPT_TOOL, handleOptimizePrompt);
}
