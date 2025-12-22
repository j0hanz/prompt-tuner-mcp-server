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
Use refine_prompt with technique "basic" to quickly improve this prompt.
</task>

<instructions>
1. Apply basic refinement (fix grammar, improve clarity, replace vague words).
2. Show the improved version in a code block.
3. List 2-3 specific changes made (e.g., "Fixed typo: 'recieve' → 'receive'").
</instructions>

<prompt>
{{PROMPT}}
</prompt>

<final_reminder>
Use refine_prompt output for the improved version. List only changes that were actually made.
</final_reminder>`;

const TEMPLATE_DEEP_OPTIMIZE = `<task>
Use optimize_prompt with techniques ["comprehensive"] to maximize prompt effectiveness.
</task>

<instructions>
1. Apply comprehensive optimization (all applicable techniques).
2. Show before/after scores with the score delta.
3. List all improvements made, grouped by technique.
4. Present the final optimized prompt in a code block.
</instructions>

<prompt>
{{PROMPT}}
</prompt>

<final_reminder>
Use optimize_prompt output for scores and the final prompt. Report actual improvements only.
</final_reminder>`;

const TEMPLATE_ANALYZE = `<task>
Analyze this prompt for quality, structure, and format.
</task>

<instructions>
1. Use analyze_prompt to get scores across 5 dimensions (clarity, specificity, completeness, structure, effectiveness).
2. Use detect_format to identify the target format (Claude XML, GPT Markdown, JSON, or auto).
3. Summarize findings:
   - Overall score with rating (Excellent 80+, Good 60-79, Fair 40-59, Needs Work <40)
   - Top 2 strengths
   - Top 3 prioritized recommendations for improvement
</instructions>

<prompt>
{{PROMPT}}
</prompt>

<final_reminder>
Base your summary on tool outputs only. Use the score interpretation guide for ratings.
</final_reminder>`;

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
</prompt>

<final_reminder>
Tie each recommendation to a specific gap you identified.
</final_reminder>`;

const TEMPLATE_ITERATIVE_REFINE = `<task>
Perform iterative refinement on this prompt.
</task>

<severity_guide>
| Severity | Criteria                                                    |
|----------|-------------------------------------------------------------|
| Critical | Breaks functionality, security risk, or completely unclear |
| High     | Significantly reduces effectiveness, major ambiguity        |
| Medium   | Noticeable quality impact, missing best practices           |
| Low      | Minor improvement opportunity, polish                       |
</severity_guide>

<instructions>
1. Use analyze_prompt to identify issues.
2. Rank the top 3 weaknesses by severity (Critical > High > Medium > Low).
3. For each weakness:
   - **Issue**: Specific problem (quote the problematic text if possible)
   - **Impact**: Why it matters for AI understanding
   - **Fix**: Concrete improvement with example
4. Use optimize_prompt with appropriate techniques to apply all fixes.
5. Show the final improved prompt with a summary of changes.
</instructions>

<prompt>
{{PROMPT}}
</prompt>

<final_reminder>
Ensure the final prompt reflects the fixes you described. Use severity to prioritize.
</final_reminder>`;

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
</prompt>

<final_reminder>
Recommend only techniques that add concrete value for this prompt.
</final_reminder>`;

const TEMPLATE_SCAN_ANTIPATTERNS = `<task>
Scan this prompt for common anti-patterns and provide corrections.
</task>

<severity_definitions>
| Severity | Impact on Prompt Effectiveness                              |
|----------|-------------------------------------------------------------|
| High     | Causes misunderstanding, wrong outputs, or failure          |
| Medium   | Reduces quality or consistency of responses                 |
| Low      | Minor clarity issue, still functional                       |
</severity_definitions>

<anti_patterns_to_detect>
1. Vague language: "something", "stuff", "things", "etc.", "various"
2. Missing role/persona context: No expert identity defined
3. Unclear output format: No specification of expected response structure
4. No constraints: Missing ALWAYS/NEVER rules or boundaries
5. Lack of examples: Complex tasks without demonstrations
6. Run-on sentences: >30 words without punctuation
7. Ambiguous pronouns: "it", "this", "that" without clear referent
8. Undefined jargon: Technical terms without explanation
9. No success criteria: No way to evaluate if output is correct
10. Conflicting instructions: Contradictory requirements
</anti_patterns_to_detect>

<instructions>
1. Use analyze_prompt to assess current state.
2. Identify anti-patterns from the list above.
3. For each anti-pattern found:
   - **Quote**: The exact problematic text
   - **Problem**: Why it's an issue
   - **Fix**: Corrected version
   - **Severity**: High/Medium/Low
4. Use refine_prompt with technique "comprehensive" to generate a corrected version.
</instructions>

<output_format>
## Anti-Patterns Detected: X

### [Severity] [Issue Type]
- **Quote**: "[exact text]"
- **Problem**: [explanation]
- **Fix**: "[corrected text]"

## Corrected Prompt
\`\`\`
[Show improved version]
\`\`\`

## Expected Improvement
[Summary of clarity, specificity, and effectiveness gains]
</output_format>

<prompt>
{{PROMPT}}
</prompt>

<final_reminder>
Quote problematic text exactly. Keep fixes concise and actionable.
</final_reminder>`;

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
