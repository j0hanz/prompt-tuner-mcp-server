import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

import type { ErrorResponse } from '../config/types.js';
import { createErrorResponse, ErrorCode } from '../lib/errors.js';
import { getProviderInfo } from '../lib/llm-client.js';
import { extractPromptFromInput } from '../lib/llm-tool-execution.js';
import { ValidatePromptInputSchema } from '../schemas/inputs.js';
import { ValidatePromptOutputSchema } from '../schemas/outputs.js';
import {
  TOKEN_LIMITS_BY_MODEL,
  TOOL_NAME,
} from './validate-prompt/constants.js';
import { buildValidationResponse } from './validate-prompt/output.js';
import { buildValidationPrompt } from './validate-prompt/prompt.js';
import { requestValidation } from './validate-prompt/run.js';
import type { ValidatePromptInput } from './validate-prompt/types.js';

const VALIDATE_PROMPT_TOOL = {
  title: 'Validate Prompt',
  description:
    'Pre-flight validation using AI: checks issues, estimates tokens, detects security risks. Returns isValid boolean and categorized issues.',
  inputSchema: ValidatePromptInputSchema,
  outputSchema: ValidatePromptOutputSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
};

async function handleValidatePrompt(
  input: ValidatePromptInput,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<ReturnType<typeof buildValidationResponse> | ErrorResponse> {
  try {
    const parsed = ValidatePromptInputSchema.parse(input);
    const validationPrompt = buildValidationPrompt(
      parsed.prompt,
      parsed.targetModel,
      parsed.checkInjection
    );
    const validation = await requestValidation(validationPrompt, extra.signal);
    const tokenLimit = TOKEN_LIMITS_BY_MODEL[parsed.targetModel];
    const provider = await getProviderInfo();

    return buildValidationResponse(
      validation,
      parsed.targetModel,
      tokenLimit,
      parsed.checkInjection,
      provider
    );
  } catch (error) {
    return createErrorResponse(
      error,
      ErrorCode.E_LLM_FAILED,
      extractPromptFromInput(input)
    );
  }
}

export function registerValidatePromptTool(server: McpServer): void {
  server.registerTool(TOOL_NAME, VALIDATE_PROMPT_TOOL, handleValidatePrompt);
}
