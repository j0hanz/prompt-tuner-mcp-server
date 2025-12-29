import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

import { LLM_TIMEOUT_MS, OPTIMIZE_MAX_TOKENS } from '../config/constants.js';
import {
  OPTIMIZATION_TECHNIQUES,
  type OptimizationTechnique,
  type OptimizeResponse,
  type TargetFormat,
} from '../config/types.js';
import type { ErrorResponse } from '../config/types.js';
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
import { resolveFormat } from '../lib/prompt-analysis/format.js';
import { wrapPromptData } from '../lib/prompt-policy.js';
import {
  asBulletList,
  asCodeBlock,
  buildOutput,
  formatProviderLine,
} from '../lib/tool-formatters.js';
import {
  executeLLMWithJsonResponse,
  extractPromptFromInput,
} from '../lib/tool-helpers.js';
import { buildPromptResourceBlock } from '../lib/tool-resources.js';
import { validatePrompt } from '../lib/validation.js';
import {
  OptimizePromptInputSchema,
  OptimizePromptOutputSchema,
} from '../schemas/index.js';
import { OptimizeResponseSchema } from '../schemas/llm-responses.js';

const TOOL_NAME = 'optimize_prompt' as const;

const OPTIMIZE_SYSTEM_PROMPT = `<role>
You are an expert prompt optimizer.
</role>

<task>
Improve the prompt using the requested techniques while preserving intent and target format.
</task>

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

const STRICT_OPTIMIZE_RULES =
  '\nSTRICT RULES: Return JSON only. Ensure the optimized prompt actually follows each technique listed in techniquesApplied. If structured, include the proper XML/Markdown structure; if chainOfThought, include exactly one reasoning trigger; if fewShot, include 2-3 Input/Output examples; if roleBased, include a clear "You are a/an/the ..." role statement.';

const COMPREHENSIVE_TECHNIQUE_ORDER = [
  'basic',
  'roleBased',
  'structured',
  'fewShot',
  'chainOfThought',
] as const;

type ConcreteTechnique = Exclude<OptimizationTechnique, 'comprehensive'>;

interface OptimizePromptInput {
  prompt: string;
  techniques?: OptimizationTechnique[];
  targetFormat?: TargetFormat;
}

interface ResolvedOptimizeInputs {
  validatedPrompt: string;
  effectiveTechniques: ConcreteTechnique[];
  resolvedFormat: TargetFormat;
}

interface OptimizeValidationConfig {
  allowedTechniques: ConcreteTechnique[];
  targetFormat: TargetFormat;
}

interface OptimizationMeta {
  usedFallback: boolean;
  scoreAdjusted: boolean;
  overallSource: 'llm' | 'server';
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
    openWorldHint: true,
  },
};

function parseOptimizeInput(input: OptimizePromptInput): OptimizePromptInput {
  return OptimizePromptInputSchema.parse(input);
}

function isConcreteTechnique(
  technique: OptimizationTechnique
): technique is ConcreteTechnique {
  return technique !== 'comprehensive';
}

function resolveTechniques(
  techniques: OptimizationTechnique[] | undefined
): OptimizationTechnique[] {
  return techniques && techniques.length > 0 ? techniques : ['basic'];
}

function resolveOptimizeInputs(
  input: OptimizePromptInput
): ResolvedOptimizeInputs {
  const requested = resolveTechniques(input.techniques);
  const deep = requested.includes('comprehensive');
  const effectiveTechniques = deep
    ? [...COMPREHENSIVE_TECHNIQUE_ORDER]
    : requested.filter(isConcreteTechnique);

  return {
    validatedPrompt: input.prompt,
    effectiveTechniques,
    resolvedFormat: resolveFormat(input.targetFormat ?? 'auto', input.prompt),
  };
}

function buildValidationConfig(
  resolved: ResolvedOptimizeInputs
): OptimizeValidationConfig {
  return {
    allowedTechniques: resolved.effectiveTechniques,
    targetFormat: resolved.resolvedFormat,
  };
}

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

async function runOptimization(
  optimizePrompt: string,
  signal: AbortSignal
): Promise<{ result: OptimizeResponse; usedFallback: boolean }> {
  const { value, usedFallback } =
    await executeLLMWithJsonResponse<OptimizeResponse>(
      optimizePrompt,
      (response) => OptimizeResponseSchema.parse(response),
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

async function optimizeOnce(
  resolved: ResolvedOptimizeInputs,
  signal: AbortSignal,
  extraRules?: string
): Promise<{ result: OptimizeResponse; usedFallback: boolean }> {
  const optimizePrompt = buildOptimizePrompt(
    resolved.validatedPrompt,
    resolved.resolvedFormat,
    resolved.effectiveTechniques,
    extraRules
  );
  return runOptimization(optimizePrompt, signal);
}

function normalizeTechniques(
  techniques: OptimizationTechnique[]
): OptimizationTechnique[] {
  return Array.from(new Set(techniques));
}

function normalizeOptimizeResult(result: OptimizeResponse): {
  normalized: OptimizeResponse;
  techniquesApplied: OptimizationTechnique[];
  appliedConcrete: ConcreteTechnique[];
} {
  const { normalized } = normalizePromptText(result.optimized);
  const techniquesApplied = normalizeTechniques(result.techniquesApplied);
  const appliedConcrete = techniquesApplied.filter(isConcreteTechnique);
  return {
    normalized: { ...result, optimized: normalized, techniquesApplied },
    techniquesApplied,
    appliedConcrete,
  };
}

function validateOptimizedText(normalized: OptimizeResponse): string | null {
  try {
    validatePrompt(normalized.optimized);
  } catch (error) {
    return error instanceof Error
      ? error.message
      : 'Optimized prompt is empty or invalid';
  }

  if (containsOutputScaffolding(normalized.optimized)) {
    return 'Output contains optimization scaffolding';
  }

  return null;
}

function hasUnexpectedTechniques(
  techniquesApplied: OptimizationTechnique[],
  allowedSet: ReadonlySet<ConcreteTechnique>
): boolean {
  return techniquesApplied.some(
    (technique) => technique !== 'comprehensive' && !allowedSet.has(technique)
  );
}

function validateAppliedTechniques(
  techniquesApplied: OptimizationTechnique[],
  appliedConcrete: ConcreteTechnique[],
  allowedSet: ReadonlySet<ConcreteTechnique>
): string | null {
  if (hasUnexpectedTechniques(techniquesApplied, allowedSet)) {
    return 'Unexpected techniques reported';
  }
  if (!appliedConcrete.length) {
    return 'No techniques applied';
  }
  return null;
}

function validateTechniqueOutputs(
  text: string,
  appliedTechniques: ConcreteTechnique[],
  targetFormat: TargetFormat
): string | null {
  for (const technique of appliedTechniques) {
    const validation = validateTechniqueOutput(text, technique, targetFormat);
    if (!validation.ok) {
      return validation.reason ?? 'Technique validation failed';
    }
  }
  return null;
}

function buildFailure(
  normalized: OptimizeResponse,
  reason: string
): { ok: false; result: OptimizeResponse; reason: string } {
  return { ok: false, result: normalized, reason };
}

function validateOptimizeResult(
  result: OptimizeResponse,
  config: OptimizeValidationConfig
): { ok: boolean; result: OptimizeResponse; reason?: string } {
  const normalizedResult = normalizeOptimizeResult(result);
  const allowedSet = new Set(config.allowedTechniques);

  const textIssue = validateOptimizedText(normalizedResult.normalized);
  if (textIssue) {
    return buildFailure(normalizedResult.normalized, textIssue);
  }

  const techniqueIssue = validateAppliedTechniques(
    normalizedResult.techniquesApplied,
    normalizedResult.appliedConcrete,
    allowedSet
  );
  if (techniqueIssue) {
    return buildFailure(normalizedResult.normalized, techniqueIssue);
  }

  const outputIssue = validateTechniqueOutputs(
    normalizedResult.normalized.optimized,
    normalizedResult.appliedConcrete,
    config.targetFormat
  );
  if (outputIssue) {
    return buildFailure(normalizedResult.normalized, outputIssue);
  }

  return { ok: true, result: normalizedResult.normalized };
}

async function runValidatedOptimization(
  resolved: ResolvedOptimizeInputs,
  signal: AbortSignal
): Promise<{ result: OptimizeResponse; usedFallback: boolean }> {
  const validationConfig = buildValidationConfig(resolved);
  const primary = await optimizeOnce(resolved, signal);
  const primaryValidation = validateOptimizeResult(
    primary.result,
    validationConfig
  );
  if (primaryValidation.ok) {
    return {
      result: primaryValidation.result,
      usedFallback: primary.usedFallback,
    };
  }

  const retry = await optimizeOnce(resolved, signal, STRICT_OPTIMIZE_RULES);
  const retryValidation = validateOptimizeResult(
    retry.result,
    validationConfig
  );
  if (!retryValidation.ok) {
    throw new McpError(
      ErrorCode.E_LLM_FAILED,
      `Optimized prompt failed validation${
        retryValidation.reason ? `: ${retryValidation.reason}` : ''
      }`
    );
  }
  return { result: retryValidation.result, usedFallback: true };
}

function normalizeOptimizationScores(result: OptimizeResponse): {
  result: OptimizeResponse;
  scoreAdjusted: boolean;
  overallSource: 'llm' | 'server';
} {
  const normalizedBefore = normalizeScore(result.beforeScore);
  const normalizedAfter = normalizeScore(result.afterScore);
  const scoreAdjusted = normalizedBefore.adjusted || normalizedAfter.adjusted;
  const overallSource = scoreAdjusted ? 'server' : 'llm';

  return {
    result: {
      ...result,
      beforeScore: normalizedBefore.score,
      afterScore: normalizedAfter.score,
    },
    scoreAdjusted,
    overallSource,
  };
}

const VALID_TECHNIQUES = new Set(OPTIMIZATION_TECHNIQUES);
const TECHNIQUE_DISPLAY_ORDER = [
  ...OPTIMIZATION_TECHNIQUES,
  'general',
] as const;
const TECHNIQUE_TAG_PATTERN = /^([a-zA-Z]+)\s*:\s*(.+)$/;

function normalizeTechniqueName(value: string): OptimizationTechnique | null {
  const normalized = value.toLowerCase();
  return VALID_TECHNIQUES.has(normalized as OptimizationTechnique)
    ? (normalized as OptimizationTechnique)
    : null;
}

function resolveTechnique(value?: string): OptimizationTechnique | null {
  if (!value) return null;
  return normalizeTechniqueName(value);
}

function resolveDetail(value?: string): string | null {
  const detail = value?.trim();
  if (!detail) return null;
  return detail;
}

function extractTechniqueMatch(trimmed: string): {
  technique: OptimizationTechnique | null;
  detail: string | null;
} | null {
  const match = TECHNIQUE_TAG_PATTERN.exec(trimmed);
  if (!match) return null;

  const technique = resolveTechnique(match[1]);
  const detail = resolveDetail(match[2]);
  return { technique, detail };
}

function splitTechniqueTag(improvement: string): {
  bucket: string;
  detail: string;
} {
  const trimmed = improvement.trim();
  if (!trimmed) return { bucket: 'general', detail: trimmed };

  const match = extractTechniqueMatch(trimmed);
  if (!match?.detail || !match.technique) {
    return { bucket: 'general', detail: trimmed };
  }
  return { bucket: match.technique, detail: match.detail };
}

function groupImprovementsByTechnique(
  improvements: string[]
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const improvement of improvements) {
    const { bucket, detail } = splitTechniqueTag(improvement);
    if (!detail) continue;

    const existing = groups.get(bucket);
    if (existing) {
      existing.push(detail);
    } else {
      groups.set(bucket, [detail]);
    }
  }
  return groups;
}

function isGeneralOnly(groups: Map<string, string[]>): boolean {
  return groups.size === 1 && groups.has('general');
}

function pushTechniqueGroup(
  lines: string[],
  technique: string,
  items: string[]
): void {
  lines.push(`Technique: ${technique}`);
  lines.push(...asBulletList(items));
}

function formatImprovements(improvements: string[]): string[] {
  const groups = groupImprovementsByTechnique(improvements);
  if (isGeneralOnly(groups)) {
    return asBulletList(improvements.map((item) => item.trim()));
  }

  const lines: string[] = [];
  for (const technique of TECHNIQUE_DISPLAY_ORDER) {
    const items = groups.get(technique);
    if (!items?.length) continue;
    pushTechniqueGroup(lines, technique, items);
  }
  return lines;
}

function formatScoreLines(
  before: OptimizeResponse['beforeScore'],
  after: OptimizeResponse['afterScore']
): string[] {
  const delta = after.overall - before.overall;
  const deltaText =
    delta === 0 ? 'Delta: 0' : `Delta: ${delta > 0 ? '+' : ''}${delta}`;

  const beforeLine =
    `Before: ${before.overall}/100 (clarity ${before.clarity}, ` +
    `specificity ${before.specificity}, completeness ${before.completeness}, ` +
    `structure ${before.structure}, effectiveness ${before.effectiveness})`;
  const afterLine =
    `After: ${after.overall}/100 (clarity ${after.clarity}, ` +
    `specificity ${after.specificity}, completeness ${after.completeness}, ` +
    `structure ${after.structure}, effectiveness ${after.effectiveness})`;

  return asBulletList([beforeLine, afterLine, deltaText]);
}

function formatOptimizeOutput(
  optimizationResult: OptimizeResponse,
  targetFormat: TargetFormat,
  provider: { provider: string; model: string }
): string {
  return buildOutput(
    'Prompt Optimization',
    [formatProviderLine(provider), `Target format: ${targetFormat}`],
    [
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
    ]
  );
}

function buildOptimizeResponse(
  result: OptimizeResponse,
  original: string,
  targetFormat: TargetFormat,
  provider: { provider: string; model: string },
  meta: OptimizationMeta
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
  try {
    const parsed = parseOptimizeInput(input);
    const resolved = resolveOptimizeInputs(parsed);
    const { result, usedFallback } = await runValidatedOptimization(
      resolved,
      extra.signal
    );
    const normalized = normalizeOptimizationScores(result);
    const provider = await getProviderInfo();

    return buildOptimizeResponse(
      normalized.result,
      resolved.validatedPrompt,
      resolved.resolvedFormat,
      provider,
      {
        usedFallback,
        scoreAdjusted: normalized.scoreAdjusted,
        overallSource: normalized.overallSource,
      }
    );
  } catch (error) {
    return createErrorResponse(
      error,
      ErrorCode.E_LLM_FAILED,
      extractPromptFromInput(input)
    );
  }
}

export function registerOptimizePromptTool(server: McpServer): void {
  server.registerTool(TOOL_NAME, OPTIMIZE_PROMPT_TOOL, handleOptimizePrompt);
}
