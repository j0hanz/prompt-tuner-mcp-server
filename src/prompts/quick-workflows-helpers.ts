import { z } from 'zod';

import { buildPromptSchema } from '../schemas/inputs.js';

interface QuickWorkflowArgs {
  prompt: string;
}

export interface QuickWorkflowDefinition {
  name: string;
  title: string;
  description: string;
  argsSchema: z.ZodRawShape;
  parseArgs: (args: unknown) => QuickWorkflowArgs;
  buildText: (args: QuickWorkflowArgs) => string;
}

export function buildPromptMessage(text: string): {
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

export function promptArg(description: string): {
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

export function renderTemplate(
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
