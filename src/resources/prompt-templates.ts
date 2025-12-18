// Prompt Template Resources for PromptTuner MCP
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

// Sanitize user input before reflecting in error messages to prevent injection
function sanitizeInput(input: string, maxLength = 50): string {
  return input
    .replace(/[<>&"'\\]/g, '') // Remove potentially dangerous characters
    .slice(0, maxLength);
}

// Pre-built prompt templates organized by category
// Based on 2024-2025 prompt engineering best practices
const PROMPT_TEMPLATES: Record<string, Record<string, string>> = {
  coding: {
    'code-review': `You are a senior software engineer conducting code review.

<code>
{{CODE}}
</code>

<task>
Review for quality, security, performance, and correctness.
</task>

<requirements>
ALWAYS: Prioritize by severity, provide line references, suggest fixes, be constructive.
NEVER: Be harsh, suggest style-only changes, over-engineer.
</requirements>

<output_format>
## Summary
Overview and main concerns.

## Issues
- **[Severity]** [Location]: Issue → Fix

## Strengths
What works well.

## Score: X/10
</output_format>`,

    'explain-code': `You are a patient programming tutor.

<code>
{{CODE}}
</code>

<task>
Explain this code for a {{SKILL_LEVEL}} developer.
</task>

<instructions>
1. One-sentence summary
2. Section-by-section breakdown
3. Key concepts and patterns used
4. Common gotchas
</instructions>`,

    refactor: `You are a senior software engineer.

<code>
{{CODE}}
</code>

<task>
Refactor for readability, maintainability, and performance while preserving functionality.
</task>

<requirements>
ALWAYS: Preserve original functionality, add comments for non-obvious changes, follow style guide.
NEVER: Change public API, add dependencies, over-engineer.
</requirements>

<output_format>
1. Refactored code
2. Summary of changes
</output_format>`,

    'debug-error': `You are a debugging expert.

<error>
{{ERROR}}
</error>

<code>
{{CODE}}
</code>

<task>
Diagnose and fix this error. Let's trace through carefully:
1. What the error means
2. Root cause
3. Fixed code
4. How to prevent recurrence
</task>`,

    'write-tests': `You are a testing expert.

<code>
{{CODE}}
</code>

<task>
Write a complete test suite using {{TEST_FRAMEWORK}}.
</task>

<requirements>
Include: happy path, edge cases, error handling.
ALWAYS: Descriptive names, Arrange-Act-Assert, mock dependencies.
NEVER: Test implementation details, write flaky tests.
</requirements>`,

    'api-documentation': `You are a technical writer.

<code>
{{CODE}}
</code>

<task>
Generate API documentation for each public function/method/class.
</task>

<output_format>
For each item:
## \`name(params)\`
**Description**: One sentence
**Parameters**: Table with name, type, required, description
**Returns**: Type and description
**Throws**: Exceptions and when
**Example**: Usage example
</output_format>`,
  },
  writing: {
    'improve-clarity': `You are a professional editor.

<text>
{{TEXT}}
</text>

<task>
Improve clarity while preserving meaning and voice.
</task>

<focus>
1. Clearer word choices
2. Shorter sentences
3. Remove redundancy
4. Logical flow
5. Active voice
</focus>

<output>
Improved text, then brief summary of changes.
</output>`,

    summarize: `You are an expert summarizer.

<text>
{{TEXT}}
</text>

<task>
Summarize in {{LENGTH}} sentences, capturing main thesis and key points.
</task>`,

    'change-tone': `You are a skilled writer.

<text>
{{TEXT}}
</text>

<task>
Rewrite with a {{TONE}} tone while preserving the message.
</task>

<tones>
Professional=formal/objective | Casual=conversational/friendly | Academic=precise/hedged | Persuasive=action-oriented | Technical=detailed/accurate
</tones>`,

    'expand-outline': `You are a skilled content writer.

<outline>
{{OUTLINE}}
</outline>

<task>
Expand into full content. Target: {{LENGTH}}, Tone: {{TONE}}.
</task>

<instructions>
1. Follow outline structure
2. Expand bullets to 1-3 paragraphs
3. Add transitions and topic sentences
4. Include introduction and conclusion
</instructions>`,

    'email-response': `You are a professional communicator.

<email>
{{EMAIL}}
</email>

<task>
Draft a response. Tone: {{TONE}}. Purpose: {{PURPOSE}}.
Key points to address: {{KEY_POINTS}}
</task>

<format>
Greeting → Address main points → Key info → Next steps → Closing
</format>`,
  },
  analysis: {
    'pros-cons': `You are an analytical thinker.

<topic>
{{TOPIC}}
</topic>

<task>
Provide a balanced pros and cons analysis. Consider multiple perspectives and short/long-term implications.
</task>

<output>
## Pros
- **[Category]**: Benefit

## Cons
- **[Category]**: Drawback

## Key Trade-offs
## Recommendation
</output>`,

    compare: `You are an analyst.

<items>
**Option 1**: {{ITEM1}}
**Option 2**: {{ITEM2}}
</items>

<task>
Compare and contrast these options.
</task>

<output>
## Comparison Table
| Criterion | {{ITEM1}} | {{ITEM2}} |

## Key Similarities
## Key Differences
## Recommendation by scenario
</output>`,

    'root-cause': `You are a problem-solving expert.

<problem>
{{PROBLEM}}
</problem>

<task>
Identify root cause using "5 Whys". Let's trace through carefully.
</task>

<output>
## Problem Statement
## 5 Whys Analysis
1. Why? → 
2. Why? → 
3. Why? → 
4. Why? → 
5. Why? → Root cause

## Solutions (address root cause)
## Prevention
</output>`,

    'decision-matrix': `You are a decision-making expert using structured analytical frameworks.

<task>
Help make a decision using a weighted decision matrix.
</task>

<options>
{{OPTIONS}}
</options>

<criteria>
{{CRITERIA}}
</criteria>

<instructions>
Let's work through this systematically:
1. Assign importance weights to each criterion (1-10)
2. Score each option on each criterion (1-10)
3. Calculate weighted scores
4. Analyze the results
</instructions>

<output_format>
## Criteria Weights
| Criterion | Weight | Rationale |
|-----------|--------|-----------|

## Scoring Matrix
| Option | Criterion 1 | ... | Weighted Total |
|--------|-------------|-----|----------------|

## Analysis
Interpretation of scores and any close calls

## Recommendation
Best option based on the analysis with confidence level
</output_format>`,
  },
  'system-prompts': {
    'assistant-base': `You are a specialized AI assistant with expertise in {{DOMAIN}}.

<behaviors>
ALWAYS:
- Be concise but thorough
- Ask clarifying questions when ambiguous
- Admit uncertainty: "I'm not certain, but..."
- Provide reasoning for claims
- Adapt to user's expertise level

NEVER:
- Make up facts or URLs
- Give harmful/illegal advice
- Pretend to have capabilities you lack
- Pad responses with unnecessary content
</behaviors>

<format_guide>
Quick factual → 1-3 sentences | How-to → numbered steps | Complex → headers | Code → code block + explanation
</format_guide>`,

    'expert-role': `You are a seasoned {{ROLE}} with {{YEARS}} years of experience in {{DOMAIN}}.

<expertise>
{{EXPERTISE_LIST}}
</expertise>

<approach>
ALWAYS: Draw on practical experience, provide specific actionable advice, consider edge cases.
NEVER: Give generic platitudes, skip safety considerations, provide outdated recommendations.
</approach>`,

    'task-specific': `<purpose>
{{PURPOSE}}
</purpose>

<context>
{{CONTEXT}}
</context>

<task>
{{STEP_BY_STEP_INSTRUCTIONS}}
</task>

<output_format>
{{OUTPUT_SPECIFICATION}}
</output_format>

<constraints>
ALWAYS: {{ALWAYS_DO}}
NEVER: {{NEVER_DO}}
</constraints>`,
  },
  'data-extraction': {
    'json-extract': `You are a data extraction specialist.

<text>
{{TEXT}}
</text>

<schema>
\`\`\`json
{{SCHEMA}}
\`\`\`
</schema>

<task>
Extract data matching the schema exactly.
</task>

<rules>
ALWAYS: Follow schema exactly, use null for missing values, normalize dates (ISO 8601) and numbers.
NEVER: Add fields not in schema, guess missing data, include explanations in output.
</rules>

<output>
Return ONLY valid JSON:
\`\`\`json
{ }
\`\`\`
</output>`,

    'entity-extraction': `You are a precise named entity recognition specialist.

<task>
Extract entities of the specified types from the text.
</task>

<entity_types>
{{ENTITY_TYPES}}
</entity_types>

<source_text>
{{TEXT}}
</source_text>

<extraction_rules>
ALWAYS:
- Extract only entities explicitly mentioned (no inference)
- Preserve exact text as found in source
- Note surrounding context for disambiguation
- Assign confidence levels based on clarity
- Handle entity variations (abbreviations, aliases)

NEVER:
- Add entities not in the text
- Modify or "correct" entity text
- Guess at entity types when unclear
</extraction_rules>

<output_format>
## Extracted Entities

| Entity | Type | Confidence | Context |
|--------|------|------------|---------|
| [exact text] | [type] | High/Medium/Low | [surrounding text] |

## Summary
- Total entities found: X
- By type breakdown: ...
- Extraction notes: [any ambiguities or issues]
</output_format>`,

    'table-parse': `You are a data transformation specialist.

<data>
{{DATA}}
</data>

<columns>
{{COLUMNS}}
</columns>

<task>
Convert to a table with the specified columns.
</task>

<rules>
ALWAYS: Use exact column names, consistent formatting, "N/A" for missing.
NEVER: Create extra columns, infer values not in source.
</rules>

<output>
| {{COLUMNS}} |
|---|
</output>`,
  },
};

const CATEGORIES = Object.keys(PROMPT_TEMPLATES);

const TEMPLATE_CATALOG = Object.entries(PROMPT_TEMPLATES).map(
  ([category, templates]) => ({
    category,
    templates: Object.keys(templates),
  })
);

const TEMPLATE_CATALOG_JSON = JSON.stringify(TEMPLATE_CATALOG, null, 2);

const TEMPLATE_RESOURCES: { uri: string; name: string }[] = [];
for (const [cat, templates] of Object.entries(PROMPT_TEMPLATES)) {
  for (const templateName of Object.keys(templates)) {
    TEMPLATE_RESOURCES.push({
      uri: `templates://${cat}/${templateName}`,
      name: `${cat}/${templateName}`,
    });
  }
}

const ALL_TEMPLATE_NAMES = Object.values(PROMPT_TEMPLATES).flatMap((t) =>
  Object.keys(t)
);

export function registerPromptTemplateResources(server: McpServer): void {
  // Static resource: List all available templates
  server.registerResource(
    'template-catalog',
    'templates://catalog',
    {
      title: 'Prompt Template Catalog',
      description: 'List of all available prompt templates by category',
      mimeType: 'application/json',
    },
    (uri) => {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: TEMPLATE_CATALOG_JSON,
          },
        ],
      };
    }
  );

  // Dynamic resource: Get specific template by category and name
  server.registerResource(
    'prompt-template',
    new ResourceTemplate('templates://{category}/{name}', {
      list: () => {
        return { resources: TEMPLATE_RESOURCES };
      },
      complete: {
        category: (value: string) => {
          return CATEGORIES.filter((c) =>
            c.toLowerCase().startsWith(value.toLowerCase())
          );
        },
        name: (value: string, context) => {
          const category = context?.arguments?.category;
          if (
            category &&
            typeof category === 'string' &&
            PROMPT_TEMPLATES[category]
          ) {
            return Object.keys(PROMPT_TEMPLATES[category]).filter((n) =>
              n.toLowerCase().startsWith(value.toLowerCase())
            );
          }
          // Return all template names if no category selected
          return ALL_TEMPLATE_NAMES.filter((n) =>
            n.toLowerCase().startsWith(value.toLowerCase())
          );
        },
      },
    }),
    {
      title: 'Prompt Template',
      description: 'Get a specific prompt template by category and name',
      mimeType: 'text/plain',
    },
    (uri, { category, name }) => {
      const categoryStr = String(category);
      const nameStr = String(name);

      const categoryTemplates = PROMPT_TEMPLATES[categoryStr];
      if (!categoryTemplates) {
        return {
          contents: [
            {
              uri: uri.href,
              text: `Error: Category "${sanitizeInput(categoryStr)}" not found. Available: ${CATEGORIES.join(', ')}`,
            },
          ],
        };
      }

      const template = categoryTemplates[nameStr];
      if (!template) {
        return {
          contents: [
            {
              uri: uri.href,
              text: `Error: Template "${sanitizeInput(nameStr)}" not found in category "${sanitizeInput(categoryStr)}". Available: ${Object.keys(categoryTemplates).join(', ')}`,
            },
          ],
        };
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/plain',
            text: template,
          },
        ],
      };
    }
  );
}
