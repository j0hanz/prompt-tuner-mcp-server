import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

import { REFINE_MAX_TOKENS, REFINE_TIMEOUT_MS } from '../config/constants.js';
import type {
  ErrorResponse,
  OptimizationTechnique,
  TargetFormat,
} from '../config/types.js';
import {
  createErrorResponse,
  createSuccessResponse,
  ErrorCode,
} from '../lib/errors.js';
import { getProviderInfo } from '../lib/llm-client.js';
import { refineLLM } from '../lib/llm.js';
import { resolveFormat } from '../lib/prompt-analysis.js';
import { getToolContext } from '../lib/tool-context.js';
import {
  asBulletList,
  asCodeBlock,
  buildOutput,
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
  provider: { provider: string; model: string }
): string {
  const meta = [
    `Provider: ${provider.provider} (${provider.model})`,
    `Technique: ${input.validatedTechnique}`,
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
  provider: { provider: string; model: string }
): ReturnType<typeof createSuccessResponse> {
  const output = buildRefineOutput(refined, corrections, input, provider);
  const promptResource = buildPromptResourceBlock(
    refined,
    `refined-prompt-${input.validatedTechnique}-${input.resolvedFormat}`
  );
  return createSuccessResponse(
    output,
    {
      ok: true,
      original: input.validatedPrompt,
      refined,
      corrections,
      technique: input.validatedTechnique,
      targetFormat: input.resolvedFormat,
      usedFallback: false,
      provider: provider.provider,
      model: provider.model,
    },
    [promptResource]
  );
}

async function refineWithLLM(
  input: ResolvedRefineInputs,
  signal: AbortSignal
): Promise<{ refined: string; corrections: string[] }> {
  const refined = await refineLLM(
    input.validatedPrompt,
    input.validatedTechnique,
    input.resolvedFormat,
    REFINE_MAX_TOKENS,
    REFINE_TIMEOUT_MS,
    signal
  );
  const corrections = buildCorrections(input.validatedPrompt, refined);
  return { refined, corrections };
}

async function handleRefinePrompt(
  input: RefinePromptInput,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<ReturnType<typeof createSuccessResponse> | ErrorResponse> {
  const context = getToolContext(extra);

  try {
    const resolved = resolveInputs(input);
    const { refined, corrections } = await refineWithLLM(
      resolved,
      context.request.signal
    );
    const provider = await getProviderInfo();
    return buildRefineResponse(refined, corrections, resolved, provider);
  } catch (error) {
    return createErrorResponse(error, ErrorCode.E_LLM_FAILED, input.prompt);
  }
}

export function registerRefinePromptTool(server: McpServer): void {
  server.registerTool('refine_prompt', REFINE_PROMPT_TOOL, handleRefinePrompt);
}
