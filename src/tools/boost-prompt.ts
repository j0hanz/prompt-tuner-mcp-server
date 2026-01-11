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
import { BoostPromptInputSchema } from '../schemas/inputs.js';
import { BoostPromptOutputSchema } from '../schemas/outputs.js';
import { TOOL_NAME } from './boost-prompt/constants.js';

const BOOST_PROMPT_TOOL = {
  title: 'Boost Prompt',
  description: 'Refine and enhance a prompt to be clearer and more effective.',
  inputSchema: BoostPromptInputSchema,
  outputSchema: BoostPromptOutputSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
};

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
    'PROMPT:',
    prompt,
  ].join('\n');
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

export function registerBoostPromptTool(server: McpServer): void {
  server.registerTool(TOOL_NAME, BOOST_PROMPT_TOOL, handleBoostPrompt);
}
