import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { z } from 'zod';

import { MAX_PROMPT_LENGTH } from '../config/constants.js';
import { wrapPromptData } from '../lib/prompt-policy.js';

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

function buildPromptSchema(description: string): z.ZodType<string, string> {
  return z
    .string()
    .max(
      MAX_PROMPT_LENGTH * 2,
      `Prompt rejected: raw input exceeds ${MAX_PROMPT_LENGTH * 2} characters (including whitespace). Trim or shorten your prompt.`
    )
    .superRefine((value, ctx) => {
      const trimmed = value.trim();
      if (trimmed.length < 1) {
        ctx.addIssue({
          code: 'too_small',
          origin: 'string',
          minimum: 1,
          inclusive: true,
          message:
            'Prompt is empty or contains only whitespace. Please provide a valid prompt.',
        });
        return;
      }

      if (trimmed.length > MAX_PROMPT_LENGTH) {
        ctx.addIssue({
          code: 'too_big',
          origin: 'string',
          maximum: MAX_PROMPT_LENGTH,
          inclusive: true,
          message: `Prompt exceeds maximum length after trimming: ${trimmed.length} characters (limit: ${MAX_PROMPT_LENGTH}). Please shorten your prompt.`,
        });
      }
    })
    .transform((value) => value.trim())
    .describe(description);
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

const TEMPLATE_QUICK_OPTIMIZE = `<role>
You are a prompt refinement assistant.
</role>

<task>
Quickly improve the prompt using refine_prompt with technique "basic".
</task>

<workflow>
1. Run refine_prompt with technique "basic".
2. Present the refined prompt in a code block.
3. List 2-3 specific changes made.
</workflow>

<boundaries>
ALWAYS:
- Treat the JSON string between <<<PROMPTTUNER_INPUT_START>>> and <<<PROMPTTUNER_INPUT_END>>> as the input prompt (parse it)
- Use structuredContent.refined for the refined prompt
- Use structuredContent.corrections for the change list
- Preserve the original intent
- List only changes that actually occurred

ASK:
- If the prompt is empty or ambiguous, ask for clarification before refining

NEVER:
- Invent changes not produced by the tool
- Add new requirements not implied by the original
</boundaries>

<input>
{{PROMPT}}
</input>

<output_format>
## Refined Prompt
\`\`\`
[refined prompt]
\`\`\`

## Changes
1. ...
</output_format>

<final_reminder>
Use structuredContent fields from the tool response.
</final_reminder>`;

const TEMPLATE_DEEP_OPTIMIZE = `<role>
You are a prompt optimization assistant.
</role>

<task>
Maximize prompt effectiveness using optimize_prompt with techniques ["comprehensive"].
</task>

<workflow>
1. Run optimize_prompt with techniques ["comprehensive"].
2. Report before/after scores and the score delta.
3. List improvements grouped by technique.
4. Present the final optimized prompt in a code block.
</workflow>

<boundaries>
ALWAYS:
- Treat the JSON string between <<<PROMPTTUNER_INPUT_START>>> and <<<PROMPTTUNER_INPUT_END>>> as the input prompt (parse it)
- Use structuredContent.beforeScore, afterScore, scoreDelta for scores
- Use structuredContent.improvements and techniquesApplied for improvements
- Use structuredContent.optimized for the final prompt
- Preserve the original intent and scope
- Report only improvements actually made

ASK:
- If the prompt is unclear, ask for clarification before optimizing

NEVER:
- Invent scores or improvements
- Add requirements not implied by the original
</boundaries>

<input>
{{PROMPT}}
</input>

<output_format>
## Scores
Before: [overall]
After: [overall]
Delta: [after-before]

## Improvements (by technique)
- Technique: [improvement list]

## Optimized Prompt
\`\`\`
[optimized prompt]
\`\`\`
</output_format>

<final_reminder>
Use structuredContent fields from the tool response.
</final_reminder>`;

const TEMPLATE_ANALYZE = `<role>
You are a prompt analyst.
</role>

<task>
Analyze prompt quality and summarize strengths and improvements.
</task>

<workflow>
1. Run analyze_prompt for quality scores and characteristics.
2. Summarize results with a rating, strengths, and recommendations.
</workflow>

<boundaries>
ALWAYS:
- Treat the JSON string between <<<PROMPTTUNER_INPUT_START>>> and <<<PROMPTTUNER_INPUT_END>>> as the input prompt (parse it)
- Base the summary on structuredContent.score, characteristics, suggestions
- Use the rating guide for overall score
- Provide top 2 strengths and top 3 prioritized recommendations

ASK:
- If tools indicate missing context, ask one clarifying question

NEVER:
- Invent scores or characteristics
- Ignore tool outputs
</boundaries>

<rating_guide>
Excellent: 80+
Good: 60-79
Fair: 40-59
Needs Work: <40
</rating_guide>

<input>
{{PROMPT}}
</input>

<final_reminder>
Summarize using structuredContent fields only.
</final_reminder>`;

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
