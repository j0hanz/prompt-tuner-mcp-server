import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

import { LLM_MAX_TOKENS } from './config.js';
import {
  createErrorResponse,
  createSuccessResponse,
  ErrorCode,
} from './lib/errors.js';
import { getLLMClient } from './lib/llm.js';
import {
  INPUT_HANDLING_SECTION,
  normalizePromptText,
  wrapPromptData,
} from './lib/prompt-utils.js';
import {
  BoostPromptInputSchema,
  CraftingPromptInputSchema,
  FixPromptInputSchema,
} from './schemas.js';
import type { ErrorResponse } from './types.js';

const FIX_PROMPT_TOOL_NAME = 'fix_prompt';
const BOOST_PROMPT_TOOL_NAME = 'boost_prompt';
const CRAFTING_PROMPT_TOOL_NAME = 'crafting_prompt';

const FIX_PROMPT_TOOL = {
  title: 'Fix Prompt',
  description:
    'Polish and refine a prompt for better clarity, readability, and flow.',
  inputSchema: FixPromptInputSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
};

const BOOST_PROMPT_TOOL = {
  title: 'Boost Prompt',
  description:
    'Transform a prompt using prompt engineering best practices for maximum clarity and effectiveness.',
  inputSchema: BoostPromptInputSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
};

const CRAFTING_PROMPT_TOOL = {
  title: 'Crafting Prompt',
  description:
    'Generate a structured, reusable workflow prompt for complex tasks based on a raw request and a few settings.',
  inputSchema: CraftingPromptInputSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
};

function extractPromptFromInput(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const { prompt } = input as { prompt?: unknown };
  return typeof prompt === 'string' ? prompt : undefined;
}

function extractRequestFromInput(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const { request } = input as { request?: unknown };
  return typeof request === 'string' ? request : undefined;
}

type CraftingPromptInput = ReturnType<typeof CraftingPromptInputSchema.parse>;

function formatMode(mode: CraftingPromptInput['mode']): string {
  switch (mode) {
    case 'plan':
      return 'Planning a large implementation/refactor';
    case 'review':
      return 'Comprehensive review/audit';
    case 'troubleshoot':
      return 'Troubleshooting/debugging';
    case 'general':
    default:
      return 'General complex task';
  }
}

function formatApproach(approach: CraftingPromptInput['approach']): string {
  switch (approach) {
    case 'conservative':
      return 'Conservative: minimize changes, ask before risky actions, prefer incremental edits.';
    case 'creative':
      return 'Creative: explore options, propose alternatives, but stay safe and verifiable.';
    case 'balanced':
    default:
      return 'Balanced: pragmatic changes, favor clarity and safety, iterate with checkpoints.';
  }
}

function formatTone(tone: CraftingPromptInput['tone']): string {
  switch (tone) {
    case 'friendly':
      return 'Friendly';
    case 'neutral':
      return 'Neutral';
    case 'direct':
    default:
      return 'Direct';
  }
}

function formatVerbosity(verbosity: CraftingPromptInput['verbosity']): string {
  switch (verbosity) {
    case 'brief':
      return 'Brief';
    case 'detailed':
      return 'Detailed';
    case 'normal':
    default:
      return 'Normal';
  }
}

function buildCraftingInstruction(input: CraftingPromptInput): string {
  const settingsLines: string[] = [
    `Mode: ${formatMode(input.mode)}`,
    `Approach: ${formatApproach(input.approach)}`,
    `Tone: ${formatTone(input.tone)}`,
    `Verbosity: ${formatVerbosity(input.verbosity)}`,
  ];
  if (input.objective) {
    settingsLines.push(`Objective: ${input.objective}`);
  }
  if (input.constraints) {
    settingsLines.push(`Constraints: ${input.constraints}`);
  }

  return [
    'You are a prompt engineering expert.',
    '',
    'Task: Create a reusable “workflow prompt” for an autonomous software engineering agent working in VS Code.',
    '',
    'Requirements:',
    '- Output MUST be a single markdown prompt starting with: # Workflow Prompt',
    '- Include sections: Context, Task, Operating rules, Execution loop, Response format.',
    '- Do NOT include analysis, preambles, quotes, or code fences around the final output.',
    '',
    'Use these settings:',
    ...settingsLines.map((line) => `- ${line}`),
    '',
    INPUT_HANDLING_SECTION,
    '',
    'User request (JSON string inside markers):',
    wrapPromptData(input.request),
  ].join('\n');
}

function buildFixInstruction(prompt: string): string {
  return [
    'You are a prompt editor specializing in clarity and readability.',
    '',
    'Task: Polish and refine the prompt below for improved clarity, flow, and word choice.',
    '',
    'Guidelines:',
    '- Fix spelling, grammar, and punctuation errors.',
    '- Improve awkward phrasing and word choice.',
    '- Enhance sentence flow and readability.',
    '- Always make at least minor improvements, even if technically correct.',
    '- Preserve the original intent and meaning.',
    '- Keep the same overall structure and length.',
    '- Do not add new sections, instructions, or major restructuring.',
    '- Output ONLY the polished prompt (no preamble, no quotes, no code fences).',
    '',
    INPUT_HANDLING_SECTION,
    '',
    'Output the polished prompt text only (not JSON).',
    '',
    wrapPromptData(prompt),
  ].join('\n');
}

function buildBoostInstruction(prompt: string): string {
  return [
    'You are a prompt engineering expert.',
    '',
    'Task: Enhance the prompt below using proven prompt engineering techniques.',
    '',
    'Focus on:',
    '- Making instructions specific and actionable.',
    '- Adding structure (bullets, steps) only where it helps.',
    '- Clarifying the expected output format.',
    '- Removing ambiguity.',
    '',
    'Rules:',
    "- Preserve the user's intent.",
    '- Keep it concise—no bloat.',
    '- Output ONLY the enhanced prompt (no preamble, no quotes, no code fences).',
    '',
    INPUT_HANDLING_SECTION,
    '',
    'Output the boosted prompt text only (not JSON).',
    '',
    wrapPromptData(prompt),
  ].join('\n');
}

async function handleFixPrompt(
  input: unknown,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<
  | ReturnType<typeof createSuccessResponse<{ ok: true; fixed: string }>>
  | ErrorResponse
> {
  try {
    const parsed = FixPromptInputSchema.parse(input);

    const client = await getLLMClient();
    const maxTokens = Math.min(LLM_MAX_TOKENS, 800);
    const text = await client.generateText(
      buildFixInstruction(parsed.prompt),
      maxTokens,
      {
        signal: extra.signal,
      }
    );

    const fixed = normalizePromptText(text);
    const structured = { ok: true as const, fixed };
    return createSuccessResponse('Fixed prompt.', structured);
  } catch (error) {
    return createErrorResponse(
      error,
      ErrorCode.E_LLM_FAILED,
      extractPromptFromInput(input)
    );
  }
}

async function handleBoostPrompt(
  input: unknown,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<
  | ReturnType<typeof createSuccessResponse<{ ok: true; boosted: string }>>
  | ErrorResponse
> {
  try {
    const parsed = BoostPromptInputSchema.parse(input);

    const client = await getLLMClient();
    const maxTokens = Math.min(LLM_MAX_TOKENS, 1200);
    const text = await client.generateText(
      buildBoostInstruction(parsed.prompt),
      maxTokens,
      { signal: extra.signal }
    );

    const boosted = normalizePromptText(text);
    const structured = { ok: true as const, boosted };
    return createSuccessResponse('Boosted prompt.', structured);
  } catch (error) {
    return createErrorResponse(
      error,
      ErrorCode.E_LLM_FAILED,
      extractPromptFromInput(input)
    );
  }
}

async function handleCraftingPrompt(
  input: unknown,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<
  | ReturnType<
      typeof createSuccessResponse<{
        ok: true;
        prompt: string;
        settings: {
          mode: string;
          approach: string;
          tone: string;
          verbosity: string;
        };
      }>
    >
  | ErrorResponse
> {
  try {
    const parsed = CraftingPromptInputSchema.parse(input);

    const client = await getLLMClient();
    const maxTokens = Math.min(LLM_MAX_TOKENS, 1600);
    const text = await client.generateText(
      buildCraftingInstruction(parsed),
      maxTokens,
      { signal: extra.signal }
    );

    const prompt = normalizePromptText(text);
    const structured = {
      ok: true as const,
      prompt,
      settings: {
        mode: parsed.mode,
        approach: parsed.approach,
        tone: parsed.tone,
        verbosity: parsed.verbosity,
      },
    };
    return createSuccessResponse('Crafted workflow prompt.', structured);
  } catch (error) {
    return createErrorResponse(
      error,
      ErrorCode.E_LLM_FAILED,
      extractRequestFromInput(input)
    );
  }
}

export function registerPromptTools(server: McpServer): void {
  server.registerTool(FIX_PROMPT_TOOL_NAME, FIX_PROMPT_TOOL, handleFixPrompt);
  server.registerTool(
    BOOST_PROMPT_TOOL_NAME,
    BOOST_PROMPT_TOOL,
    handleBoostPrompt
  );
  server.registerTool(
    CRAFTING_PROMPT_TOOL_NAME,
    CRAFTING_PROMPT_TOOL,
    handleCraftingPrompt
  );
}
