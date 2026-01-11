import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

import { config } from './config.js';
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
import { BoostPromptInputSchema, FixPromptInputSchema } from './schemas.js';
import type { ErrorResponse } from './types.js';

const FIX_PROMPT_TOOL_NAME = 'fix_prompt';
const BOOST_PROMPT_TOOL_NAME = 'boost_prompt';

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

function extractPromptFromInput(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const { prompt } = input as { prompt?: unknown };
  return typeof prompt === 'string' ? prompt : undefined;
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
    const maxTokens = Math.min(config.LLM_MAX_TOKENS, 800);
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
    const maxTokens = Math.min(config.LLM_MAX_TOKENS, 1200);
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

export function registerPromptTools(server: McpServer): void {
  server.registerTool(FIX_PROMPT_TOOL_NAME, FIX_PROMPT_TOOL, handleFixPrompt);
  server.registerTool(
    BOOST_PROMPT_TOOL_NAME,
    BOOST_PROMPT_TOOL,
    handleBoostPrompt
  );
}
