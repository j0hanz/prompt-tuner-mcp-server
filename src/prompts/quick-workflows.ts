import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { wrapPromptData } from '../lib/prompt-policy.js';
import {
  buildPromptMessage,
  promptArg,
  type QuickWorkflowDefinition,
  renderTemplate,
} from './quick-workflows-helpers.js';
import {
  TEMPLATE_ANALYZE,
  TEMPLATE_DEEP_OPTIMIZE,
  TEMPLATE_QUICK_OPTIMIZE,
} from './quick-workflows-templates.js';

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
