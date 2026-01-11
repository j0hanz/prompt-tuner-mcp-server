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
    'Fix spelling and grammar only. Does not rewrite or add content.',
  inputSchema: FixPromptInputSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
};

const BOOST_PROMPT_TOOL = {
  title: 'Boost Prompt',
  description: 'Refine and enhance a prompt to be clearer and more effective.',
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
    'You are a careful editor.',
    '',
    'Task: Fix ONLY spelling and grammar in the text below.',
    'Rules:',
    '- Do not rewrite, rephrase, or add new information.',
    '- Do not remove information.',
    '- Preserve formatting, bulleting, and code blocks as much as possible.',
    '- Output ONLY the corrected text (no preamble, no quotes, no code fences).',
    '',
    INPUT_HANDLING_SECTION,
    '',
    'Output the corrected text only (not JSON).',
    '',
    wrapPromptData(prompt),
  ].join('\n');
}

function buildBoostInstruction(prompt: string): string {
  return [
    'You are a prompt improvement assistant.',
    '',
    'Task: Improve the prompt below to be clearer, more specific, and easier to follow.',
    'Guidelines:',
    "- Preserve the user's intent.",
    '- Add only helpful structure (headings/bullets) when it improves clarity.',
    '- Avoid unnecessary verbosity.',
    '- Output ONLY the improved prompt (no preamble, no quotes, no code fences).',
    '',
    INPUT_HANDLING_SECTION,
    '',
    'Output the improved prompt text only (not JSON).',
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
