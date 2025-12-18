// Quick Workflow Prompts for PromptTuner MCP
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
            text: `Use refine_prompt with technique "basic" on this prompt. Show the improved version and briefly note key changes.

Prompt: ${prompt}`,
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
            text: `Use optimize_prompt with techniques ["comprehensive"].

Show: before/after scores, all improvements made, final optimized prompt.

Prompt: ${prompt}`,
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
            text: `Analyze this prompt:
1. Use analyze_prompt for scores (clarity, specificity, completeness, structure, effectiveness)
2. Use detect_format to identify target format
3. Summarize: overall score, strengths, top 3 recommendations

Prompt: ${prompt}`,
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
            text: `Review this prompt against best practices:
1. Use analyze_prompt for current state
2. Check: clarity, context/role, structure, output format, constraints
3. For each gap: what's missing, why it matters, how to fix

Prompt: ${prompt}`,
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
            text: `Perform iterative refinement on this prompt:

1. Use analyze_prompt to identify issues
2. Rank the top 3 weaknesses by severity
3. For each weakness:
   - What's wrong (specific issue)
   - Why it matters (impact on AI understanding)
   - Specific fix (concrete improvement)
4. Use optimize_prompt with appropriate techniques to apply all fixes
5. Show the final improved prompt with a summary of changes

Prompt: ${prompt}`,
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
            text: `Recommend optimization techniques for this prompt:

Task Type: ${taskType}

Process:
1. Use analyze_prompt to understand current state and weaknesses
2. Use detect_format to understand target format preference
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
5. Suggest optimal technique combination for optimize_prompt

Prompt: ${prompt}`,
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
            text: `Scan this prompt for common anti-patterns:

Use analyze_prompt to check for these issues:

**Anti-Patterns to Detect:**
1. Vague language (something, stuff, things, etc.)
2. Missing role/persona context
3. Unclear or missing output format specification
4. No constraints or boundaries (ALWAYS/NEVER rules)
5. Lack of examples for complex/ambiguous tasks
6. Overly long run-on sentences (>30 words)
7. Ambiguous pronouns (it, this, that without clear referent)
8. Missing context for technical or domain-specific terms
9. No success criteria or quality indicators
10. Conflicting or contradictory instructions

For each anti-pattern found:
- Quote the problematic text
- Explain why it's problematic
- Provide a corrected version
- Note the severity (high/medium/low impact)

Then use refine_prompt with technique "comprehensive" to show a fully corrected version.

Summary format:
## Anti-Patterns Detected: X
[List each with severity]

## Corrected Prompt
[Show improved version]

## Impact
Expected improvement in clarity, specificity, and effectiveness.

Prompt: ${prompt}`,
          },
        },
      ],
    })
  );
}
