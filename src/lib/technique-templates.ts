// Optimization technique templates for PromptTuner MCP
// Based on 2024-2025 prompt engineering best practices from Anthropic, OpenAI, and industry leaders
import type {
  OptimizationTechnique,
  TargetFormat,
  TechniqueTemplate,
} from '../config/types.js';

const TECHNIQUE_TEMPLATES: Record<OptimizationTechnique, TechniqueTemplate> = {
  basic: {
    name: 'basic',
    description: 'Simple clarity and grammar improvements',
    systemPrompt: `<task>
Improve prompt clarity, fix grammar and spelling, replace vague terms with specifics.
</task>

<rules>
ALWAYS:
- Fix spelling and grammar
- Replace vague words ("something", "stuff")
- Clarify ambiguous references
- Add punctuation if missing

NEVER:
- Add new requirements
- Change the core task
- Remove important context
</rules>

Return ONLY the refined prompt.`,
  },

  chainOfThought: {
    name: 'chainOfThought',
    description: 'Add step-by-step reasoning',
    systemPrompt: `<task>
Add step-by-step reasoning guidance appropriate for the task.
</task>

<examples>
Math: "Let's calculate step by step."
Analysis: "Let's analyze systematically."
Debug: "Let's trace through carefully."
Planning: "Let's break this into phases."
</examples>

<rules>
ALWAYS:
- Add task-appropriate reasoning trigger
- Place after the main task

NEVER:
- Add to simple queries
- Use generic triggers
</rules>

Return ONLY the optimized prompt.`,
  },

  fewShot: {
    name: 'fewShot',
    description: 'Add examples (few-shot prompting)',
    systemPrompt: `<task>
Add 2-3 diverse input/output examples to demonstrate the expected behavior.
</task>

<rules>
ALWAYS:
- Add 2-3 diverse examples
- Show clear input→output pairs
- Place examples before the main task
- Use <example> tags (Claude) or ### headers (GPT)

NEVER:
- Add to trivial tasks
- Use confusing examples
- Use placeholder values like "[example]"
</rules>

Return ONLY the optimized prompt.`,
  },

  roleBased: {
    name: 'roleBased',
    description: 'Add expert persona/role',
    systemPrompt: `<task>
Add an expert role/persona relevant to the task.
</task>

<examples>
Code: "You are a senior software engineer..."
Writing: "You are a professional editor..."
Analysis: "You are a data analyst..."
Teaching: "You are an expert tutor..."
</examples>

<rules>
ALWAYS:
- Place role at the start
- Use format: "You are [role] with expertise in [domain]"
- Keep it concise

NEVER:
- Use generic roles ("helpful assistant")
- Add unnecessary backstory
</rules>

Return ONLY the optimized prompt.`,
  },

  structured: {
    name: 'structured',
    description: 'Add formatting structure (XML/Markdown)',
    systemPrompt: `<task>
Add clear structural formatting appropriate for the target format.
</task>

<format_guidance>
For Claude:
- Use XML tags: <context>, <task>, <requirements>, <output>
- Keep nesting shallow (max 2 levels)

For GPT:
- Use ## Headers for sections
- Use bullet lists and **bold**
- Keep sections scannable
</format_guidance>

<rules>
ALWAYS:
- Organize into clear sections
- Use lists for multiple items
- Match the target format

NEVER:
- Over-structure simple prompts
- Mix XML and Markdown
- Nest deeply (max 2 levels)
</rules>

Return ONLY the structured prompt.`,
  },

  comprehensive: {
    name: 'comprehensive',
    description: 'Apply all optimization techniques',
    systemPrompt: `<task>
Apply multiple optimization techniques intelligently to maximize prompt quality.
</task>

<approach>
Consider applying (where beneficial):
1. Expert role (if domain knowledge helps)
2. Clear structure (XML for Claude, Markdown for GPT)
3. Specific, unambiguous language
4. Step-by-step guidance (for complex tasks)
5. Examples (if output format unclear)
6. Explicit constraints (ALWAYS/NEVER)
7. Output format specification
</approach>

<rules>
ALWAYS:
- Apply techniques that add value
- Maintain original intent
- Stay concise

NEVER:
- Over-engineer simple prompts
- Add unnecessary length
- Mix formatting styles
</rules>

Return ONLY the optimized prompt.`,
  },
};

function getTechniqueTemplate(
  technique: OptimizationTechnique
): TechniqueTemplate {
  return TECHNIQUE_TEMPLATES[technique];
}

/** Format-specific instruction templates */
const FORMAT_INSTRUCTIONS: Record<Exclude<TargetFormat, 'auto'>, string> = {
  claude: `
<format_instructions>
TARGET FORMAT: Claude (XML structure)

Use semantic XML tags to organize content:
- <context> for background information
- <task> for the main objective  
- <instructions> for step-by-step guidance
- <requirements> for constraints and rules
- <examples> for input/output demonstrations
- <output_format> for expected response structure
</format_instructions>`,

  gpt: `
<format_instructions>
TARGET FORMAT: GPT (Markdown structure)

Use Markdown formatting for clarity:
- ## Headers for main sections (Context, Task, Requirements)
- **Bold** for emphasis on key terms
- - Bullet lists for multiple items
- 1. Numbered lists for sequential steps
- \`code\` for technical terms or values
- > Blockquotes for examples or notes
</format_instructions>`,

  json: `
<format_instructions>
TARGET FORMAT: JSON output

Structure the prompt to request JSON output:
- Specify the exact JSON schema expected
- Include field descriptions and types
- Provide an example of the expected structure
- Mention validation requirements if any

Example schema specification:
{
  "field_name": "description (type)",
  "required_field": "must be present",
  "optional_field?": "may be omitted"
}
</format_instructions>`,
};

function getFormatInstructions(format: TargetFormat): string {
  if (format === 'auto') return '';
  return FORMAT_INSTRUCTIONS[format];
}

export function buildRefinementPrompt(
  originalPrompt: string,
  technique: OptimizationTechnique,
  targetFormat: TargetFormat
): string {
  const template = getTechniqueTemplate(technique);
  const formatInstructions = getFormatInstructions(targetFormat);

  return `${template.systemPrompt}
${formatInstructions}

ORIGINAL PROMPT:
${originalPrompt}`;
}
