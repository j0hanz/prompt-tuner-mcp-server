import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { z } from 'zod';

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

const TEMPLATE_QUICK_OPTIMIZE = `<task>
Use refine_prompt with technique "basic" on this prompt.
</task>

<instructions>
1. Apply basic refinement (grammar, clarity, vague words).
2. Show the improved version.
3. Briefly note key changes.
</instructions>

<prompt>
{{PROMPT}}
</prompt>`;

const TEMPLATE_DEEP_OPTIMIZE = `<task>
Use optimize_prompt with techniques ["comprehensive"].
</task>

<instructions>
1. Apply comprehensive optimization.
2. Show before/after scores.
3. List all improvements made.
4. Show the final optimized prompt.
</instructions>

<prompt>
{{PROMPT}}
</prompt>`;

const TEMPLATE_ANALYZE = `<task>
Analyze this prompt for quality and structure.
</task>

<instructions>
1. Use analyze_prompt for scores (clarity, specificity, completeness, structure, effectiveness).
2. Use detect_format to identify target format.
3. Summarize: overall score, strengths, top 3 recommendations.
</instructions>

<prompt>
{{PROMPT}}
</prompt>`;

const TEMPLATE_REVIEW = `<task>
Review this prompt against best practices.
</task>

<instructions>
1. Use analyze_prompt for current state.
2. Check: clarity, context/role, structure, output format, constraints.
3. For each gap: what's missing, why it matters, how to fix.
</instructions>

<prompt>
{{PROMPT}}
</prompt>`;

const TEMPLATE_ITERATIVE_REFINE = `<task>
Perform iterative refinement on this prompt.
</task>

<instructions>
1. Use analyze_prompt to identify issues.
2. Rank the top 3 weaknesses by severity.
3. For each weakness:
   - What's wrong (specific issue)
   - Why it matters (impact on AI understanding)
   - Specific fix (concrete improvement)
4. Use optimize_prompt with appropriate techniques to apply all fixes.
5. Show the final improved prompt with a summary of changes.
</instructions>

<prompt>
{{PROMPT}}
</prompt>`;

const TEMPLATE_RECOMMEND_TECHNIQUES = `<task>
Recommend optimization techniques for this prompt.
</task>

<context>
Task Type: {{TASK_TYPE}}
</context>

<instructions>
1. Use analyze_prompt to understand current state and weaknesses.
2. Use detect_format to understand target format preference.
3. Based on task type and analysis, recommend techniques in priority order:
   - basic: Always beneficial for grammar/clarity
   - chainOfThought: For reasoning, math, debugging, analysis tasks
   - fewShot: For classification, translation, pattern-based tasks
   - roleBased: When domain expertise would improve output
   - structured: For complex multi-part instructions
   - comprehensive: When prompt needs significant improvement
4. For each recommended technique:
   - Why it's beneficial for this prompt
   - Expected improvement area (clarity, structure, effectiveness)
   - Priority level (high/medium/low)
5. Suggest optimal technique combination for optimize_prompt.
</instructions>

<prompt>
{{PROMPT}}
</prompt>`;

const TEMPLATE_SCAN_ANTIPATTERNS = `<task>
Scan this prompt for common anti-patterns.
</task>

<instructions>
1. Use analyze_prompt to check for issues.
2. Detect these anti-patterns:
   - Vague language (something, stuff, things)
   - Missing role/persona context
   - Unclear or missing output format specification
   - No constraints or boundaries (ALWAYS/NEVER rules)
   - Lack of examples for complex/ambiguous tasks
   - Overly long run-on sentences (>30 words)
   - Ambiguous pronouns (it, this, that without clear referent)
   - Missing context for technical or domain-specific terms
   - No success criteria or quality indicators
   - Conflicting or contradictory instructions

3. For each anti-pattern found:
   - Quote the problematic text
   - Explain why it's problematic
   - Provide a corrected version
   - Note the severity (high/medium/low impact)

4. Use refine_prompt with technique "comprehensive" to show a fully corrected version.
</instructions>

<output_format>
## Anti-Patterns Detected: X
[List each with severity]

## Corrected Prompt
[Show improved version]

## Impact
Expected improvement in clarity, specificity, and effectiveness.
</output_format>

<prompt>
{{PROMPT}}
</prompt>`;

const QUICK_WORKFLOW_PROMPTS: QuickWorkflowDefinition[] = [
  {
    name: 'quick-optimize',
    title: 'Quick Optimize',
    description: 'Fast prompt improvement with grammar and clarity fixes.',
    argsSchema: promptArg('The prompt to optimize'),
    buildText: ({ prompt }) =>
      renderTemplate(TEMPLATE_QUICK_OPTIMIZE, { PROMPT: prompt }),
  },
  {
    name: 'deep-optimize',
    title: 'Deep Optimize',
    description: 'Comprehensive optimization with all techniques applied.',
    argsSchema: promptArg('The prompt to optimize'),
    buildText: ({ prompt }) =>
      renderTemplate(TEMPLATE_DEEP_OPTIMIZE, { PROMPT: prompt }),
  },
  {
    name: 'analyze',
    title: 'Analyze Prompt',
    description: 'Score prompt quality and get improvement suggestions.',
    argsSchema: promptArg('The prompt to analyze'),
    buildText: ({ prompt }) =>
      renderTemplate(TEMPLATE_ANALYZE, { PROMPT: prompt }),
  },
  {
    name: 'review',
    title: 'Best Practices Review',
    description: 'Check prompt against prompting best practices.',
    argsSchema: promptArg('The prompt to review'),
    buildText: ({ prompt }) =>
      renderTemplate(TEMPLATE_REVIEW, { PROMPT: prompt }),
  },
  {
    name: 'iterative-refine',
    title: 'Iterative Refinement',
    description:
      'Identify top 3 weaknesses, explain each, and apply fixes iteratively.',
    argsSchema: promptArg('The prompt to refine'),
    buildText: ({ prompt }) =>
      renderTemplate(TEMPLATE_ITERATIVE_REFINE, { PROMPT: prompt }),
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
        PROMPT: prompt,
        TASK_TYPE: taskType ?? 'other',
      }),
  },
  {
    name: 'scan-antipatterns',
    title: 'Scan Anti-Patterns',
    description: 'Detect common prompt anti-patterns and provide corrections.',
    argsSchema: promptArg('The prompt to scan'),
    buildText: ({ prompt }) =>
      renderTemplate(TEMPLATE_SCAN_ANTIPATTERNS, { PROMPT: prompt }),
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
