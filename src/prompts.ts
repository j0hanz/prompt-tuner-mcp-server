import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
  buildBoostInstruction,
  buildFixInstruction,
} from './lib/prompt-utils.js';
import { BoostPromptInputSchema, FixPromptInputSchema } from './schemas.js';

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'fix-prompt',
    {
      description: 'Template for fixing grammar and clarity',
      argsSchema: FixPromptInputSchema.shape,
    },
    (args) => {
      const { prompt } = args;
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: buildFixInstruction(prompt),
            },
          },
        ],
      };
    }
  );

  server.registerPrompt(
    'boost-prompt',
    {
      description: 'Template for boosting prompt effectiveness',
      argsSchema: BoostPromptInputSchema.shape,
    },
    (args) => {
      const { prompt } = args;
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: buildBoostInstruction(prompt),
            },
          },
        ],
      };
    }
  );
}
