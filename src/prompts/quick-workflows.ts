import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { z } from 'zod';

export function registerQuickWorkflowPrompts(server: McpServer): void {
  // Quick Optimize - single technique, fast
  server.registerPrompt(
    'quick-optimize',
    {
      title: 'Quick Optimize',
      description: 'Fast prompt improvement with grammar and clarity fixes.',
      argsSchema: {
        prompt: z.string().min(1).describe('The prompt to optimize'),
      },
    },
    ({ prompt }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `<task>
Use refine_prompt with technique "basic" on this prompt.
</task>

<instructions>
1. Apply basic refinement (grammar, clarity, vague words).
2. Show the improved version.
3. Briefly note key changes.
</instructions>

<prompt>
${prompt}
</prompt>`,
          },
        },
      ],
    })
  );

  // Deep Optimize - comprehensive, thorough
  server.registerPrompt(
    'deep-optimize',
    {
      title: 'Deep Optimize',
      description: 'Comprehensive optimization with all techniques applied.',
      argsSchema: {
        prompt: z.string().min(1).describe('The prompt to optimize'),
      },
    },
    ({ prompt }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `<task>
Use optimize_prompt with techniques ["comprehensive"].
</task>

<instructions>
1. Apply comprehensive optimization.
2. Show before/after scores.
3. List all improvements made.
4. Show the final optimized prompt.
</instructions>

<prompt>
${prompt}
</prompt>`,
          },
        },
      ],
    })
  );

  // Full Analysis - scoring and recommendations
  server.registerPrompt(
    'analyze',
    {
      title: 'Analyze Prompt',
      description: 'Score prompt quality and get improvement suggestions.',
      argsSchema: {
        prompt: z.string().min(1).describe('The prompt to analyze'),
      },
    },
    ({ prompt }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `<task>
Analyze this prompt for quality and structure.
</task>

<instructions>
1. Use analyze_prompt for scores (clarity, specificity, completeness, structure, effectiveness).
2. Use detect_format to identify target format.
3. Summarize: overall score, strengths, top 3 recommendations.
</instructions>

<prompt>
${prompt}
</prompt>`,
          },
        },
      ],
    })
  );

  // Best Practices Review
  server.registerPrompt(
    'review',
    {
      title: 'Best Practices Review',
      description: 'Check prompt against prompting best practices.',
      argsSchema: {
        prompt: z.string().min(1).describe('The prompt to review'),
      },
    },
    ({ prompt }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `<task>
Review this prompt against best practices.
</task>

<instructions>
1. Use analyze_prompt for current state.
2. Check: clarity, context/role, structure, output format, constraints.
3. For each gap: what's missing, why it matters, how to fix.
</instructions>

<prompt>
${prompt}
</prompt>`,
          },
        },
      ],
    })
  );

  // Iterative Refinement
  server.registerPrompt(
    'iterative-refine',
    {
      title: 'Iterative Refinement',
      description:
        'Identify top 3 weaknesses, explain each, and apply fixes iteratively.',
      argsSchema: {
        prompt: z.string().min(1).describe('The prompt to refine'),
      },
    },
    ({ prompt }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `<task>
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
${prompt}
</prompt>`,
          },
        },
      ],
    })
  );

  // Technique Recommendation
  server.registerPrompt(
    'recommend-techniques',
    {
      title: 'Recommend Techniques',
      description:
        'Recommend best optimization techniques based on prompt and task type.',
      argsSchema: {
        prompt: z.string().min(1).describe('The prompt to analyze'),
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
    },
    ({ prompt, taskType }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `<task>
Recommend optimization techniques for this prompt.
</task>

<context>
Task Type: ${taskType}
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
${prompt}
</prompt>`,
          },
        },
      ],
    })
  );

  // Anti-Pattern Scanner
  server.registerPrompt(
    'scan-antipatterns',
    {
      title: 'Scan Anti-Patterns',
      description:
        'Detect common prompt anti-patterns and provide corrections.',
      argsSchema: {
        prompt: z.string().min(1).describe('The prompt to scan'),
      },
    },
    ({ prompt }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `<task>
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
${prompt}
</prompt>`,
          },
        },
      ],
    })
  );
}
