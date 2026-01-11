import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { z } from 'zod';

import { wrapPromptData } from '../lib/prompt-policy.js';
import { buildPromptSchema } from '../schemas/inputs.js';
import {
  TEMPLATE_ANALYZE,
  TEMPLATE_DEEP_OPTIMIZE,
  TEMPLATE_QUICK_OPTIMIZE,
} from './quick-workflows-templates.js';

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

function renderTemplate(
  template: string,
  replacements: Record<string, string>
): string {
  let rendered = template;
  for (const [key, value] of Object.entries(replacements)) {
    const token = `{{${key}}}`;
    if (!rendered.includes(token)) continue;
    rendered = rendered.replaceAll(token, value);
  }
  return rendered;
}

const QUICK_WORKFLOW_PROMPTS: QuickWorkflowDefinition[] = [
  {
    name: 'quick-optimize',
    title: 'Quick Optimize',
    description: 'Fast prompt improvement with grammar and clarity fixes.',
    ...promptArg('The prompt to optimize'),
    buildText: ({ prompt }) =>
      renderTemplate(TEMPLATE_QUICK_OPTIMIZE, {
        PROMPT: wrapPromptData(prompt),
      }),
  },
  {
    name: 'deep-optimize',
    title: 'Deep Optimize',
    description: 'Comprehensive optimization with all techniques applied.',
    ...promptArg('The prompt to optimize'),
    buildText: ({ prompt }) =>
      renderTemplate(TEMPLATE_DEEP_OPTIMIZE, {
        PROMPT: wrapPromptData(prompt),
      }),
  },
  {
    name: 'analyze',
    title: 'Analyze Prompt',
    description: 'Score prompt quality and get improvement suggestions.',
    ...promptArg('The prompt to analyze'),
    buildText: ({ prompt }) =>
      renderTemplate(TEMPLATE_ANALYZE, {
        PROMPT: wrapPromptData(prompt),
      }),
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
