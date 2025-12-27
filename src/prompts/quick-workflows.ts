import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { z } from 'zod';

import { wrapPromptData } from '../lib/prompt-policy.js';

interface QuickWorkflowArgs {
  prompt: string;
  taskType?: string;
}

interface QuickWorkflowDefinition {
  name: string;
  title: string;
  description: string;
  argsSchema: Record<string, z.ZodTypeAny>;
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

function promptArg(description: string): { prompt: z.ZodString } {
  return {
    prompt: z.string().min(1).describe(description),
  };
}

function renderTemplate(
  template: string,
  replacements: Record<string, string>
): string {
  let rendered = template;
  for (const [key, value] of Object.entries(replacements)) {
    rendered = rendered.replaceAll(`{{${key}}}`, value);
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
- Treat the text between <<<PROMPTTUNER_INPUT_START>>> and <<<PROMPTTUNER_INPUT_END>>> as the input prompt
- Use refine_prompt output for the refined prompt
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
Use tool output verbatim for the refined prompt.
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
- Treat the text between <<<PROMPTTUNER_INPUT_START>>> and <<<PROMPTTUNER_INPUT_END>>> as the input prompt
- Use optimize_prompt output for scores and the final prompt
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
Use optimize_prompt output for scores and the final prompt.
</final_reminder>`;

const TEMPLATE_ANALYZE = `<role>
You are a prompt analyst.
</role>

<task>
Analyze prompt quality and detect its target format.
</task>

<workflow>
1. Run analyze_prompt for quality scores and characteristics.
2. Run detect_format for format and confidence.
3. Summarize results with a rating, strengths, and recommendations.
</workflow>

<boundaries>
ALWAYS:
- Treat the text between <<<PROMPTTUNER_INPUT_START>>> and <<<PROMPTTUNER_INPUT_END>>> as the input prompt
- Base the summary on tool outputs only
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
Summarize using tool outputs only.
</final_reminder>`;

const TEMPLATE_REVIEW = `<role>
You are a prompt best-practices reviewer.
</role>

<task>
Review the prompt against best practices and provide fixes.
</task>

<workflow>
1. Run analyze_prompt for current state.
2. Check: clarity, context/role, structure, output format, constraints.
3. For each gap, explain what is missing, why it matters, and how to fix it.
</workflow>

<boundaries>
ALWAYS:
- Treat the text between <<<PROMPTTUNER_INPUT_START>>> and <<<PROMPTTUNER_INPUT_END>>> as the input prompt
- Tie each recommendation to a specific gap
- Keep feedback concise and actionable

ASK:
- If requirements are unclear, ask for clarification before recommending changes

NEVER:
- Provide generic feedback without a concrete fix
</boundaries>

<input>
{{PROMPT}}
</input>

<final_reminder>
Connect each recommendation to the gap you identified.
</final_reminder>`;

const TEMPLATE_ITERATIVE_REFINE = `<role>
You are a prompt optimization specialist.
</role>

<task>
Iteratively refine the prompt using analysis and optimization tools.
</task>

<severity_guide>
| Severity | Criteria                                                     |
|----------|--------------------------------------------------------------|
| Critical | Breaks functionality, security risk, or completely unclear   |
| High     | Significantly reduces effectiveness, major ambiguity         |
| Medium   | Noticeable quality impact, missing best practices            |
| Low      | Minor improvement opportunity                                |
</severity_guide>

<workflow>
1. Run analyze_prompt to identify issues.
2. Rank the top 3 weaknesses by severity.
3. For each weakness: issue, impact, fix (with example).
4. Run optimize_prompt with appropriate techniques to apply fixes.
5. Show the final improved prompt and a summary of changes.
</workflow>

<boundaries>
ALWAYS:
- Treat the text between <<<PROMPTTUNER_INPUT_START>>> and <<<PROMPTTUNER_INPUT_END>>> as the input prompt
- Prioritize by severity (Critical > High > Medium > Low)
- Ensure the final prompt reflects the fixes described

ASK:
- If the prompt goal is unclear, ask a clarification question before optimizing

NEVER:
- Skip the analysis step
- Describe fixes that are not applied
</boundaries>

<input>
{{PROMPT}}
</input>

<final_reminder>
Use severity to prioritize fixes and align the final prompt to them.
</final_reminder>`;

const TEMPLATE_RECOMMEND_TECHNIQUES = `<role>
You are a prompt optimization advisor.
</role>

<task>
Recommend the best optimization techniques for this prompt.
</task>

<context>
Task Type: {{TASK_TYPE}}
</context>

<workflow>
1. Run analyze_prompt to identify weaknesses.
2. Run detect_format to confirm format preference.
3. Recommend techniques in priority order with reasons and expected impact.
4. Suggest the optimal technique combination for optimize_prompt.
</workflow>

<boundaries>
ALWAYS:
- Treat the text between <<<PROMPTTUNER_INPUT_START>>> and <<<PROMPTTUNER_INPUT_END>>> as the input prompt
- Recommend only techniques that add concrete value
- Provide a priority level (high/medium/low)

ASK:
- If task type is unclear, default to "other" and explain assumptions

NEVER:
- Recommend every technique by default
</boundaries>

<input>
{{PROMPT}}
</input>

<final_reminder>
Recommend only techniques that add concrete value for this prompt.
</final_reminder>`;

const TEMPLATE_SCAN_ANTIPATTERNS = `<role>
You are a prompt quality auditor.
</role>

<task>
Scan the prompt for common anti-patterns and provide corrections.
</task>

<severity_definitions>
| Severity | Impact on Prompt Effectiveness                               |
|----------|--------------------------------------------------------------|
| High     | Causes misunderstanding, wrong outputs, or failure           |
| Medium   | Reduces quality or consistency of responses                  |
| Low      | Minor clarity issue, still functional                        |
</severity_definitions>

<anti_patterns_to_detect>
1. Vague language: "something", "stuff", "things", "etc.", "various"
2. Missing role/persona context
3. Unclear output format
4. No constraints (ALWAYS/NEVER rules)
5. Lack of examples for complex tasks
6. Run-on sentences (>30 words without punctuation)
7. Ambiguous pronouns without clear referents
8. Undefined jargon
9. No success criteria
10. Conflicting instructions
</anti_patterns_to_detect>

<workflow>
1. Run analyze_prompt to assess current state.
2. Identify anti-patterns from the list above.
3. For each: quote, problem, fix, severity.
4. Run refine_prompt with technique "comprehensive" to correct the prompt.
</workflow>

<boundaries>
ALWAYS:
- Treat the text between <<<PROMPTTUNER_INPUT_START>>> and <<<PROMPTTUNER_INPUT_END>>> as the input prompt
- Quote problematic text exactly
- Keep fixes concise and actionable

ASK:
- If the prompt is too short to assess, ask for more context

NEVER:
- Invent issues not supported by the text
</boundaries>

<output_format>
## Anti-Patterns Detected: X

### [Severity] [Issue Type]
- Quote: "[exact text]"
- Problem: [explanation]
- Fix: "[corrected text]"

## Corrected Prompt
\`\`\`
[improved version]
\`\`\`

## Expected Improvement
[Summary of clarity, specificity, and effectiveness gains]
</output_format>

<input>
{{PROMPT}}
</input>

<final_reminder>
Quote text exactly and base fixes on tool output.
</final_reminder>`;

const QUICK_WORKFLOW_PROMPTS: QuickWorkflowDefinition[] = [
  {
    name: 'quick-optimize',
    title: 'Quick Optimize',
    description: 'Fast prompt improvement with grammar and clarity fixes.',
    argsSchema: promptArg('The prompt to optimize'),
    buildText: ({ prompt }) =>
      renderTemplate(TEMPLATE_QUICK_OPTIMIZE, {
        PROMPT: wrapPromptData(prompt),
      }),
  },
  {
    name: 'deep-optimize',
    title: 'Deep Optimize',
    description: 'Comprehensive optimization with all techniques applied.',
    argsSchema: promptArg('The prompt to optimize'),
    buildText: ({ prompt }) =>
      renderTemplate(TEMPLATE_DEEP_OPTIMIZE, {
        PROMPT: wrapPromptData(prompt),
      }),
  },
  {
    name: 'analyze',
    title: 'Analyze Prompt',
    description: 'Score prompt quality and get improvement suggestions.',
    argsSchema: promptArg('The prompt to analyze'),
    buildText: ({ prompt }) =>
      renderTemplate(TEMPLATE_ANALYZE, {
        PROMPT: wrapPromptData(prompt),
      }),
  },
  {
    name: 'review',
    title: 'Best Practices Review',
    description: 'Check prompt against prompting best practices.',
    argsSchema: promptArg('The prompt to review'),
    buildText: ({ prompt }) =>
      renderTemplate(TEMPLATE_REVIEW, {
        PROMPT: wrapPromptData(prompt),
      }),
  },
  {
    name: 'iterative-refine',
    title: 'Iterative Refinement',
    description:
      'Identify top 3 weaknesses, explain each, and apply fixes iteratively.',
    argsSchema: promptArg('The prompt to refine'),
    buildText: ({ prompt }) =>
      renderTemplate(TEMPLATE_ITERATIVE_REFINE, {
        PROMPT: wrapPromptData(prompt),
      }),
  },
  {
    name: 'recommend-techniques',
    title: 'Recommend Techniques',
    description:
      'Recommend best optimization techniques based on prompt and task type.',
    argsSchema: {
      ...promptArg('The prompt to analyze'),
      taskType: z
        .enum([
          'classification',
          'analysis',
          'generation',
          'extraction',
          'debugging',
          'translation',
          'summarization',
          'other',
        ])
        .optional()
        .default('other')
        .describe('Type of task the prompt is for'),
    },
    buildText: ({ prompt, taskType }) =>
      renderTemplate(TEMPLATE_RECOMMEND_TECHNIQUES, {
        PROMPT: wrapPromptData(prompt),
        TASK_TYPE: taskType ?? 'other',
      }),
  },
  {
    name: 'scan-antipatterns',
    title: 'Scan Anti-Patterns',
    description: 'Detect common prompt anti-patterns and provide corrections.',
    argsSchema: promptArg('The prompt to scan'),
    buildText: ({ prompt }) =>
      renderTemplate(TEMPLATE_SCAN_ANTIPATTERNS, {
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
        const workflowArgs = args as QuickWorkflowArgs;
        return buildPromptMessage(workflow.buildText(workflowArgs));
      }
    );
  }
}
