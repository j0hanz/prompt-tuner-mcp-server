import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { describe, expect, it } from 'vitest';

import { registerQuickWorkflowPrompts } from '../src/prompts/quick-workflows.js';

type RegisteredPrompt = {
  name: string;
  handler: (args: { prompt: string; taskType?: string }) => {
    messages: { role: string; content: { type: string; text: string } }[];
  };
};

describe('registerQuickWorkflowPrompts', () => {
  it('registers expected quick workflow prompts', () => {
    const registered: RegisteredPrompt[] = [];
    const server = {
      registerPrompt: (
        name: string,
        _definition: unknown,
        handler: RegisteredPrompt['handler']
      ) => {
        registered.push({ name, handler });
      },
    } as unknown as McpServer;

    registerQuickWorkflowPrompts(server);

    const names = registered.map((entry) => entry.name);
    expect(names).toEqual(['quick-optimize', 'deep-optimize', 'analyze']);
  });
});
