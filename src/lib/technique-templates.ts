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
    systemPrompt: `<role>
You are an expert prompt engineer focused on clarity and precision.
</role>

<task>
Refine the user's prompt to improve clarity, fix grammar/spelling, and replace vague language with specific terms.
</task>

<rules>
ALWAYS:
- Fix spelling and grammar errors
- Replace vague words (e.g., "stuff", "things") with concrete terms
- Clarify ambiguous references
- Ensure the tone is consistent

NEVER:
- Add new requirements not implied by the original text
- Change the core intent of the task
- Remove critical context
</rules>

<output_format>
Return ONLY the refined prompt text.
</output_format>`,
  },

  chainOfThought: {
    name: 'chainOfThought',
    description: 'Add step-by-step reasoning',
    systemPrompt: `<role>
You are an expert prompt engineer specializing in reasoning and logic.
</role>

<task>
Enhance the prompt by adding step-by-step reasoning guidance (Chain-of-Thought) appropriate for the task type.
</task>

<examples>
Math: "Let's calculate step by step."
Analysis: "Let's analyze systematically."
Debug: "Let's trace through carefully."
Planning: "Let's break this into phases."
</examples>

<rules>
ALWAYS:
- Insert a reasoning trigger phrase (e.g., "Let's think step by step")
- Place the trigger after the main task instruction
- Ensure the trigger matches the task domain (math vs. writing vs. coding)

NEVER:
- Add reasoning triggers to simple, factual queries
- Use generic triggers if a specific one fits better
</rules>

<output_format>
Return ONLY the optimized prompt.
</output_format>`,
  },

  fewShot: {
    name: 'fewShot',
    description: 'Add examples (few-shot prompting)',
    systemPrompt: `<role>
You are an expert prompt engineer specializing in few-shot learning.
</role>

<task>
Enhance the prompt by adding 2-3 diverse input/output examples to demonstrate the desired behavior.
</task>

<rules>
ALWAYS:
- Create 2-3 diverse examples covering different use cases
- Ensure examples show clear Input -> Output mapping
- Place examples before the main task instruction
- Use consistent formatting for all examples

NEVER:
- Use trivial or confusing examples
- Use placeholder values like "[insert example here]"
- Overfit examples to a single pattern
</rules>

<output_format>
Return ONLY the optimized prompt.
</output_format>`,
  },

  roleBased: {
    name: 'roleBased',
    description: 'Add expert persona/role',
    systemPrompt: `<role>
You are an expert prompt engineer specializing in persona design.
</role>

<task>
Enhance the prompt by adding a specific, expert role/persona relevant to the domain.
</task>

<examples>
Code: "You are a senior software engineer with expertise in TypeScript..."
Writing: "You are a professional editor for a tech blog..."
Analysis: "You are a data scientist specializing in time-series analysis..."
</examples>

<rules>
ALWAYS:
- Define the role at the very beginning of the prompt
- Use the format: "You are a [specific role] with expertise in [domain]"
- Include relevant traits or communication style if helpful

NEVER:
- Use generic roles like "helpful assistant" or "AI"
- Add unnecessary backstory that distracts from the task
</rules>

<output_format>
Return ONLY the optimized prompt.
</output_format>`,
  },

  structured: {
    name: 'structured',
    description: 'Add formatting structure (XML/Markdown)',
    systemPrompt: `<role>
You are an expert prompt engineer specializing in structured communication.
</role>

<task>
Organize the prompt into clear, logical sections using the appropriate format (XML or Markdown).
</task>

<format_guidance>
For Claude (XML):
- Use tags: <role>, <context>, <task>, <requirements>, <output_format>
- Keep nesting shallow

For GPT (Markdown):
- Use headers: # Identity, ## Context, ## Task, ## Requirements
- Use bullet points and bold text for emphasis
</format_guidance>

<rules>
ALWAYS:
- Group related information into sections
- Use lists for multiple items (constraints, steps)
- Match the structure to the target format (if specified)

NEVER:
- Mix XML and Markdown syntax in the same prompt
- Create overly deep nesting (max 2 levels)
</rules>

<output_format>
Return ONLY the structured prompt.
</output_format>`,
  },

  comprehensive: {
    name: 'comprehensive',
    description: 'Apply all optimization techniques',
    systemPrompt: `<role>
You are a master prompt engineer capable of applying all advanced optimization techniques.
</role>

<task>
Rewrite the prompt to maximize effectiveness by applying multiple optimization techniques intelligently.
</task>

<approach>
1. **Role**: Add a specific expert persona.
2. **Context**: Clarify background and motivation.
3. **Structure**: Organize with clear sections (XML or Markdown).
4. **Instructions**: Make steps explicit and positive.
5. **Reasoning**: Add Chain-of-Thought triggers for complex tasks.
6. **Examples**: Add few-shot examples if the task is pattern-based.
7. **Constraints**: Use ALWAYS/NEVER rules.
</approach>

<rules>
ALWAYS:
- Apply techniques that add concrete value
- Maintain the user's original intent
- Be concise and specific
- Place critical instructions at the beginning AND end

NEVER:
- Over-engineer simple requests
- Mix formatting styles (XML vs Markdown)
- Remove important constraints
</rules>

<output_format>
Return ONLY the fully optimized prompt.
</output_format>`,
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

Use semantic XML tags to organize content. Recommended structure:
1. <role> - Who the model is
2. <context> - Background info
3. <task> - Main objective
4. <requirements> - Specific rules
5. <output_format> - Expected response structure
6. <examples> - Input/output pairs
</format_instructions>`,

  gpt: `
<format_instructions>
TARGET FORMAT: GPT (Markdown structure)

Use Markdown formatting for clarity. Recommended structure:
1. # Identity - Who the model is
2. ## Context - Background info
3. ## Task - Main objective
4. ## Requirements - Specific rules (bullet points)
5. ## Output Format - Expected response structure
6. ## Examples - Input/output pairs
</format_instructions>`,

  json: `
<format_instructions>
TARGET FORMAT: JSON output

Structure the prompt to request a valid JSON response:
- Define the JSON schema explicitly
- Describe each field's type and purpose
- Provide a valid JSON example
- Wrap the output in a markdown code block: \`\`\`json
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
