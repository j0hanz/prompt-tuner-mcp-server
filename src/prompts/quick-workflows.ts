import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { z } from 'zod';

import { wrapPromptData } from '../lib/prompt-policy.js';
import { buildPromptSchema } from '../schemas/inputs.js';

interface QuickWorkflowArgs {
  prompt: string;
}

interface QuickWorkflowDefinition {
  name: string;
  title: string;
  description: string;
  argsSchema: z.ZodRawShape;
  parseArgs: (args: unknown) => QuickWorkflowArgs;
  buildText: (args: QuickWorkflowArgs) => string;
}

function buildPromptMessage(text: string): {
  messages: {
    role: 'user';
    content: { type: 'text'; text: string };
  }[];
} {
  return {
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text,
        },
      },
    ],
  };
}

function promptArg(description: string): {
  argsSchema: z.ZodRawShape;
  parseArgs: (args: unknown) => QuickWorkflowArgs;
} {
  const promptSchema = buildPromptSchema(description);
  const schema = z.strictObject({
    prompt: promptSchema,
  });
  return {
    argsSchema: schema.shape,
    parseArgs: (args) => schema.parse(args),
  };
}

const QUICK_WORKFLOW_PROMPTS: QuickWorkflowDefinition[] = [
  {
    name: 'fix',
    title: 'Fix Prompt',
    description: 'Fix spelling and grammar only.',
    ...promptArg('The prompt to fix'),
    buildText: ({ prompt }) =>
      [
        'Fix spelling and grammar in the following text. Do not rewrite or add content.',
        '',
        wrapPromptData(prompt),
      ].join('\n'),
  },
  {
    name: 'boost',
    title: 'Boost Prompt',
    description: 'Refine and enhance a prompt for clarity and effectiveness.',
    ...promptArg('The prompt to boost'),
    buildText: ({ prompt }) =>
      [
        'Improve the following prompt to be clearer and more effective while preserving intent.',
        'Return only the improved prompt.',
        '',
        wrapPromptData(prompt),
      ].join('\n'),
  },
];

export function registerQuickWorkflowPrompts(server: McpServer): void {
  for (const workflow of QUICK_WORKFLOW_PROMPTS) {
    server.registerPrompt(
      workflow.name,
      {
        title: workflow.title,
        description: workflow.description,
        argsSchema: workflow.argsSchema,
      },
      (args) => {
        const workflowArgs = workflow.parseArgs(args);
        return buildPromptMessage(workflow.buildText(workflowArgs));
      }
    );
  }
}
