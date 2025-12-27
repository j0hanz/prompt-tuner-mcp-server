import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

import { LLM_TIMEOUT_MS, REFINE_MAX_TOKENS } from '../config/constants.js';
import type {
  ErrorResponse,
  OptimizationTechnique,
  TargetFormat,
} from '../config/types.js';
import {
  createErrorResponse,
  createSuccessResponse,
  ErrorCode,
  McpError,
} from '../lib/errors.js';
import { getProviderInfo } from '../lib/llm-client.js';
import { refineLLM } from '../lib/llm.js';
import {
  containsOutputScaffolding,
  normalizePromptText,
  validateTechniqueOutput,
} from '../lib/output-validation.js';
import { resolveFormat } from '../lib/prompt-analysis.js';
import { getToolContext } from '../lib/tool-context.js';
import {
  asBulletList,
  asCodeBlock,
  buildOutput,
  formatProviderLine,
} from '../lib/tool-formatters.js';
import { buildPromptResourceBlock } from '../lib/tool-resources.js';
import {
  validateFormat,
  validatePrompt,
  validateTechnique,
} from '../lib/validation.js';
import {
  RefinePromptInputSchema,
  RefinePromptOutputSchema,
} from '../schemas/index.js';

interface RefinePromptInput {
  prompt: string;
  technique?: string;
  targetFormat?: string;
}

interface ResolvedRefineInputs {
  validatedPrompt: string;
  validatedTechnique: OptimizationTechnique;
  resolvedFormat: TargetFormat;
}

const REFINE_PROMPT_TOOL = {
  title: 'Refine Prompt',
  description:
    'Fix grammar, improve clarity, and apply optimization techniques. Use when: user asks to fix/improve/optimize a prompt, prompt has typos, or prompt is vague. Default technique: "basic" for quick fixes. Use "comprehensive" for best results.',
  inputSchema: RefinePromptInputSchema.shape,
  outputSchema: RefinePromptOutputSchema.shape,
  annotations: {
    readOnlyHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
};

const TOOL_NAME = 'refine_prompt' as const;
const STRICT_REFINEMENT_RULES =
  '\nSTRICT RULES: Return only the refined prompt text. Do not include headings, explanations, or code fences. Ensure the output follows the selected technique and target format.';

function resolveInputs(input: RefinePromptInput): ResolvedRefineInputs {
  const validatedPrompt = validatePrompt(input.prompt);
  const technique = input.technique ?? 'basic';
  const targetFormat = input.targetFormat ?? 'auto';
  const validatedTechnique = validateTechnique(technique);
  const validatedFormat = validateFormat(targetFormat);
  const resolvedFormat = resolveFormat(validatedFormat, validatedPrompt);
  return { validatedPrompt, validatedTechnique, resolvedFormat };
}

function buildCorrections(original: string, refined: string): string[] {
  if (refined === original) {
    return ['No changes needed - prompt is already well-formed'];
  }

  const corrections = ['Applied LLM refinement'];
  if (original.length !== refined.length) {
    corrections.push(`Length: ${original.length} -> ${refined.length} chars`);
  }
  return corrections;
}

function buildRefineOutput(
  refined: string,
  corrections: string[],
  input: ResolvedRefineInputs,
  techniqueUsed: OptimizationTechnique,
  provider: { provider: string; model: string }
): string {
  const meta = [
    formatProviderLine(provider),
    `Technique: ${techniqueUsed}`,
    `Target format: ${input.resolvedFormat}`,
  ];

  return buildOutput('Prompt Refinement', meta, [
    { title: 'Refined Prompt', lines: asCodeBlock(refined) },
    { title: 'Changes', lines: asBulletList(corrections) },
  ]);
}

function buildRefineResponse(
  refined: string,
  corrections: string[],
  input: ResolvedRefineInputs,
  techniqueUsed: OptimizationTechnique,
  usedFallback: boolean,
  provider: { provider: string; model: string }
): ReturnType<typeof createSuccessResponse> {
  const output = buildRefineOutput(
    refined,
    corrections,
    input,
    techniqueUsed,
    provider
  );
  const promptResource = buildPromptResourceBlock(
    refined,
    `refined-prompt-${techniqueUsed}-${input.resolvedFormat}`
  );
  return createSuccessResponse(
    output,
    {
      ok: true,
      original: input.validatedPrompt,
      refined,
      corrections,
      technique: techniqueUsed,
      targetFormat: input.resolvedFormat,
      usedFallback,
      provider: provider.provider,
      model: provider.model,
    },
    [promptResource]
  );
}

async function refineWithLLM(
  input: ResolvedRefineInputs,
  signal: AbortSignal
): Promise<{
  refined: string;
  corrections: string[];
  techniqueUsed: OptimizationTechnique;
  usedFallback: boolean;
}> {
  let usedFallback = false;
  let techniqueUsed = input.validatedTechnique;

  const attemptRefinement = async (
    technique: OptimizationTechnique,
    extraInstructions?: string
  ): Promise<string> =>
    refineLLM(
      input.validatedPrompt,
      technique,
      input.resolvedFormat,
      REFINE_MAX_TOKENS,
      LLM_TIMEOUT_MS,
      signal,
      extraInstructions
    );

  const validateOutput = (output: string): { ok: boolean; reason?: string } => {
    if (containsOutputScaffolding(output)) {
      return { ok: false, reason: 'Output contains scaffolding or formatting' };
    }
    const validation = validateTechniqueOutput(
      output,
      techniqueUsed,
      input.resolvedFormat
    );
    return validation.ok
      ? { ok: true }
      : { ok: false, reason: validation.reason };
  };

  let refined = await attemptRefinement(techniqueUsed);
  refined = normalizePromptText(refined).normalized;

  let validation = validateOutput(refined);

  if (!validation.ok) {
    refined = await attemptRefinement(techniqueUsed, STRICT_REFINEMENT_RULES);
    refined = normalizePromptText(refined).normalized;
    usedFallback = true;
    validation = validateOutput(refined);
  }

  if (!validation.ok && techniqueUsed !== 'basic') {
    techniqueUsed = 'basic';
    refined = await attemptRefinement(techniqueUsed, STRICT_REFINEMENT_RULES);
    refined = normalizePromptText(refined).normalized;
    usedFallback = true;
    validation = validateOutput(refined);
  }

  if (!validation.ok) {
    throw new McpError(
      ErrorCode.E_LLM_FAILED,
      `Refined prompt failed validation${
        validation.reason ? `: ${validation.reason}` : ''
      }`
    );
  }

  const corrections = buildCorrections(input.validatedPrompt, refined);
  return { refined, corrections, techniqueUsed, usedFallback };
}

async function handleRefinePrompt(
  input: RefinePromptInput,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<ReturnType<typeof createSuccessResponse> | ErrorResponse> {
  const context = getToolContext(extra);

  try {
    const resolved = resolveInputs(input);
    const { refined, corrections, techniqueUsed, usedFallback } =
      await refineWithLLM(resolved, context.request.signal);
    const provider = await getProviderInfo();
    return buildRefineResponse(
      refined,
      corrections,
      resolved,
      techniqueUsed,
      usedFallback,
      provider
    );
  } catch (error) {
    return createErrorResponse(error, ErrorCode.E_LLM_FAILED, input.prompt);
  }
}

export function registerRefinePromptTool(server: McpServer): void {
  server.registerTool(TOOL_NAME, REFINE_PROMPT_TOOL, handleRefinePrompt);
}
