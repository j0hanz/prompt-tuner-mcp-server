import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

import { LLM_TIMEOUT_MS, OPTIMIZE_MAX_TOKENS } from '../config/constants.js';
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
  McpError,
} from '../lib/errors.js';
import { getProviderInfo } from '../lib/llm-client.js';
import { normalizeScore } from '../lib/output-normalization.js';
import {
  containsOutputScaffolding,
  normalizePromptText,
  validateTechniqueOutput,
} from '../lib/output-validation.js';
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
const STRICT_OPTIMIZE_RULES =
  '\nSTRICT RULES: Return JSON only. Ensure the optimized prompt actually follows each technique listed in techniquesApplied. If structured, include the proper XML/Markdown structure; if chainOfThought, include exactly one reasoning trigger; if fewShot, include 2-3 Input/Output examples; if roleBased, include a clear "You are a/an/the ..." role statement.';

type ConcreteTechnique = Exclude<OptimizationTechnique, 'comprehensive'>;

function isConcreteTechnique(
  technique: OptimizationTechnique
): technique is ConcreteTechnique {
  return technique !== 'comprehensive';
}

const COMPREHENSIVE_TECHNIQUE_ORDER: ConcreteTechnique[] = [
  'basic',
  'roleBased',
  'structured',
  'fewShot',
  'chainOfThought',
];

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
  effectiveTechniques: ConcreteTechnique[];
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
  techniques: OptimizationTechnique[],
  extraRules?: string
): string {
  return `${OPTIMIZE_SYSTEM_PROMPT}\n\nTarget Format: ${resolvedFormat}\nTechniques to apply: ${techniques.join(
    ', '
  )}\n${extraRules ?? ''}\n\n<original_prompt>\n${wrapPromptData(
    prompt
  )}\n</original_prompt>`;
}

function resolveOptimizeInputs(
  input: OptimizePromptInput
): ResolvedOptimizeInputs {
  const validatedPrompt = validatePrompt(input.prompt);
  const techniques = input.techniques ?? ['basic'];
  const targetFormat = input.targetFormat ?? 'auto';
  const requestedTechniques = validateTechniques(techniques);
  const validatedFormat = validateFormat(targetFormat);
  const resolvedFormat = resolveFormat(validatedFormat, validatedPrompt);
  const deepOptimization = requestedTechniques.includes('comprehensive');
  const effectiveTechniques = deepOptimization
    ? COMPREHENSIVE_TECHNIQUE_ORDER
    : requestedTechniques.filter(isConcreteTechnique);

  return { validatedPrompt, effectiveTechniques, resolvedFormat };
}

async function runOptimization(
  optimizePrompt: string,
  signal: AbortSignal
): Promise<{ result: OptimizeResponse; usedFallback: boolean }> {
  const { value, usedFallback } =
    await executeLLMWithJsonResponse<OptimizeResponse>(
      optimizePrompt,
      (value) => OptimizeResponseSchema.parse(value),
      ErrorCode.E_LLM_FAILED,
      TOOL_NAME,
      {
        maxTokens: OPTIMIZE_MAX_TOKENS,
        timeoutMs: LLM_TIMEOUT_MS,
        signal,
        retryOnParseFailure: true,
      }
    );
  return { result: value, usedFallback };
}

function normalizeTechniques(
  techniques: OptimizationTechnique[]
): OptimizationTechnique[] {
  return Array.from(new Set(techniques));
}

interface OptimizeValidationConfig {
  allowedTechniques: ConcreteTechnique[];
  targetFormat: TargetFormat;
}

function validateOptimizeResult(
  result: OptimizeResponse,
  config: OptimizeValidationConfig
): { ok: boolean; result: OptimizeResponse; reason?: string } {
  const { normalized } = normalizePromptText(result.optimized);
  const techniquesApplied = normalizeTechniques(result.techniquesApplied);
  const allowedSet = new Set(config.allowedTechniques);
  const appliedTechniques = techniquesApplied.filter(isConcreteTechnique);

  if (containsOutputScaffolding(normalized)) {
    return {
      ok: false,
      result: { ...result, optimized: normalized, techniquesApplied },
      reason: 'Output contains optimization scaffolding',
    };
  }

  if (
    techniquesApplied.some(
      (technique) => technique !== 'comprehensive' && !allowedSet.has(technique)
    )
  ) {
    return {
      ok: false,
      result: { ...result, optimized: normalized, techniquesApplied },
      reason: 'Unexpected techniques reported',
    };
  }

  if (!appliedTechniques.length) {
    return {
      ok: false,
      result: { ...result, optimized: normalized, techniquesApplied },
      reason: 'No techniques applied',
    };
  }

  for (const technique of appliedTechniques) {
    const validation = validateTechniqueOutput(
      normalized,
      technique,
      config.targetFormat
    );
    if (!validation.ok) {
      return {
        ok: false,
        result: { ...result, optimized: normalized, techniquesApplied },
        reason: validation.reason,
      };
    }
  }

  return {
    ok: true,
    result: { ...result, optimized: normalized, techniquesApplied },
  };
}

function buildOptimizeResponse(
  result: OptimizeResponse,
  original: string,
  targetFormat: TargetFormat,
  provider: { provider: string; model: string },
  meta: { usedFallback: boolean; scoreAdjusted: boolean; overallSource: string }
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
      usedFallback: meta.usedFallback,
      scoreAdjusted: meta.scoreAdjusted,
      overallSource: meta.overallSource,
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
      resolved.effectiveTechniques
    );
    let { result: optimizationResult, usedFallback } = await runOptimization(
      optimizePrompt,
      context.request.signal
    );

    let validation = validateOptimizeResult(optimizationResult, {
      allowedTechniques: resolved.effectiveTechniques,
      targetFormat: resolved.resolvedFormat,
    });

    if (!validation.ok) {
      const retryPrompt = buildOptimizePrompt(
        resolved.validatedPrompt,
        resolved.resolvedFormat,
        resolved.effectiveTechniques,
        STRICT_OPTIMIZE_RULES
      );
      const retryResult = await runOptimization(
        retryPrompt,
        context.request.signal
      );
      usedFallback = true;
      optimizationResult = retryResult.result;
      validation = validateOptimizeResult(optimizationResult, {
        allowedTechniques: resolved.effectiveTechniques,
        targetFormat: resolved.resolvedFormat,
      });
    }

    if (!validation.ok) {
      throw new McpError(
        ErrorCode.E_LLM_FAILED,
        `Optimized prompt failed validation${
          validation.reason ? `: ${validation.reason}` : ''
        }`
      );
    }

    const normalizedResult = validation.result;
    const normalizedBefore = normalizeScore(normalizedResult.beforeScore);
    const normalizedAfter = normalizeScore(normalizedResult.afterScore);
    const scoreAdjusted = normalizedBefore.adjusted || normalizedAfter.adjusted;
    const overallSource = scoreAdjusted ? 'server' : 'llm';
    const scoredResult: OptimizeResponse = {
      ...normalizedResult,
      beforeScore: normalizedBefore.score,
      afterScore: normalizedAfter.score,
    };
    const provider = await getProviderInfo();
    return buildOptimizeResponse(
      scoredResult,
      resolved.validatedPrompt,
      resolved.resolvedFormat,
      provider,
      {
        usedFallback,
        scoreAdjusted,
        overallSource,
      }
    );
  } catch (error) {
    return createErrorResponse(error, ErrorCode.E_LLM_FAILED, input.prompt);
  }
}

export function registerOptimizePromptTool(server: McpServer): void {
  server.registerTool(TOOL_NAME, OPTIMIZE_PROMPT_TOOL, handleOptimizePrompt);
}
