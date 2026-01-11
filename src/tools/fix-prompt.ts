import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

import { config } from '../config/env.js';
import type { ErrorResponse } from '../config/types.js';
import {
  createErrorResponse,
  createSuccessResponse,
  ErrorCode,
} from '../lib/errors.js';
import { getLLMClient } from '../lib/llm-client.js';
import { extractPromptFromInput } from '../lib/llm-tool-execution.js';
import { normalizePromptText } from '../lib/output-validation.js';
import { FixPromptInputSchema } from '../schemas/inputs.js';
import { FixPromptOutputSchema } from '../schemas/outputs.js';
import { TOOL_NAME } from './fix-prompt/constants.js';

const FIX_PROMPT_TOOL = {
  title: 'Fix Prompt',
  description:
    'Fix spelling and grammar only. Does not rewrite or add content.',
  inputSchema: FixPromptInputSchema,
  outputSchema: FixPromptOutputSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
};

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
    'TEXT:',
    prompt,
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

export function registerFixPromptTool(server: McpServer): void {
  server.registerTool(TOOL_NAME, FIX_PROMPT_TOOL, handleFixPrompt);
}
