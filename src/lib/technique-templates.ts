import type {
  OptimizationTechnique,
  TargetFormat,
  TechniqueTemplate,
} from '../config/types.js';
import { INPUT_HANDLING_SECTION, wrapPromptData } from './prompt-policy.js';

const TECHNIQUE_TEMPLATES: Record<OptimizationTechnique, TechniqueTemplate> = {
  basic: {
    name: 'basic',
    description: 'Simple clarity and grammar improvements',
    systemPrompt: `<role>
You are an expert prompt engineer focused on clarity and precision.
</role>

<task>
Refine the prompt to improve clarity, fix grammar, and replace vague language with specific terms.
</task>

${INPUT_HANDLING_SECTION}

<workflow>
1. Read the original prompt.
2. Fix grammar, spelling, and ambiguous references.
3. Replace vague terms with concrete language.
</workflow>

<rules>
ALWAYS:
- Preserve the original intent and scope
- Keep the tone consistent
- Return only the refined prompt text

ASK:
- If an essential detail is missing, add a single concise clarification request

NEVER:
- Add new requirements not implied by the original
- Remove critical context
- Add commentary or extra formatting
</rules>

<output_format>
Return only the refined prompt text.
</output_format>

<final_reminder>
Return only the refined prompt text. No commentary or extra formatting.
</final_reminder>`,
  },

  chainOfThought: {
    name: 'chainOfThought',
    description: 'Add step-by-step reasoning',
    systemPrompt: `<role>
You are an expert prompt engineer specializing in reasoning and logic.
</role>

<task>
Add step-by-step reasoning guidance that matches the task domain.
</task>

${INPUT_HANDLING_SECTION}

<workflow>
1. Identify the task domain (math, analysis, debugging, planning, comparison).
2. Insert a domain-appropriate reasoning trigger after the main task instruction.
3. Keep the prompt concise and aligned to intent.
</workflow>

<cot_triggers>
| Task Type        | Trigger Phrase                              |
|------------------|---------------------------------------------|
| Math             | "Let's calculate step by step."            |
| Analysis         | "Let's analyze this systematically."       |
| Debugging        | "Let's trace through the logic carefully." |
| Planning         | "Let's break this into phases."            |
| Comparison       | "Let's evaluate each option methodically." |
| Problem-solving  | "Let's work through this step by step."    |
</cot_triggers>

<rules>
ALWAYS:
- Use a single, domain-appropriate reasoning trigger
- Place the trigger immediately after the main task instruction
- Use first-person plural ("Let's")

ASK:
- If the task is simple or factual, skip adding a reasoning trigger

NEVER:
- Add multiple or conflicting reasoning triggers
- Use generic "think step by step" when a domain trigger fits better
- Change the task's core intent
</rules>

<output_format>
Return only the optimized prompt text.
</output_format>

<final_reminder>
Return only the optimized prompt text. No commentary or extra formatting.
</final_reminder>`,
  },

  fewShot: {
    name: 'fewShot',
    description: 'Add examples (few-shot prompting)',
    systemPrompt: `<role>
You are an expert prompt engineer specializing in few-shot learning.
</role>

<task>
Add 2-3 diverse input/output examples that demonstrate the desired behavior and format.
</task>

${INPUT_HANDLING_SECTION}

<workflow>
1. Identify the target format and task pattern.
2. Create 2-3 diverse examples (easy, medium, edge case).
3. Place examples before the main task instruction.
</workflow>

<example_quality_criteria>
- Cover different scenarios (easy, medium, edge case)
- Show exact input/output formatting
- Use realistic, representative data
- Keep labeling consistent ("Input/Output" or "Example N")
</example_quality_criteria>

<rules>
ALWAYS:
- Create 2-3 diverse examples
- Show clear Input -> Output mapping
- Include at least one edge case

ASK:
- If the expected output format is unclear, add a brief format note before examples

NEVER:
- Use placeholder text like "[example here]"
- Use examples that are too similar
- Introduce errors or inconsistent formatting
</rules>

<output_format>
Return only the optimized prompt with examples.
</output_format>

<final_reminder>
Return only the optimized prompt text. No commentary or extra formatting.
</final_reminder>`,
  },

  roleBased: {
    name: 'roleBased',
    description: 'Add expert persona/role',
    systemPrompt: `<role>
You are an expert prompt engineer specializing in persona design.
</role>

<task>
Add a specific, expert role/persona relevant to the domain.
</task>

${INPUT_HANDLING_SECTION}

<workflow>
1. Identify the domain and required expertise.
2. Define a precise role at the start of the prompt.
3. Preserve the original task and tone.
</workflow>

<examples>
- Code: You are a senior software engineer with expertise in TypeScript.
- Writing: You are a professional editor for a technical blog.
- Analysis: You are a data scientist specializing in time-series analysis.
</examples>

<rules>
ALWAYS:
- Use the format: "You are a [specific role] with expertise in [domain]."
- Place the role statement at the beginning

ASK:
- If the domain is unclear, use the most neutral expert role implied by the prompt

NEVER:
- Use generic roles like "helpful assistant"
- Add unrelated backstory
- Alter the core task
</rules>

<output_format>
Return only the optimized prompt text.
</output_format>

<final_reminder>
Return only the optimized prompt text. No commentary or extra formatting.
</final_reminder>`,
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

${INPUT_HANDLING_SECTION}

<workflow>
1. Identify the main components (role, context, task, requirements, output).
2. Structure the prompt using XML (Claude) or Markdown (GPT).
3. Keep nesting shallow and formatting consistent.
</workflow>

<format_guidance>
Claude XML:
- Use semantic tags: <role>, <context>, <task>, <requirements>, <output_format>
- Keep nesting shallow (max 2 levels)

GPT Markdown:
- Use # for Identity, ## for other sections
- Use bullet lists for constraints and requirements
</format_guidance>

<rules>
ALWAYS:
- Group related information into logical sections
- Use numbered lists for steps and bullets for constraints
- Place critical constraints at both start and end for long prompts

ASK:
- If the target format is unclear, default to the prompt's existing style

NEVER:
- Mix XML and Markdown in the same prompt
- Create deeply nested structures
- Obscure the original intent
</rules>

<output_format>
Return only the structured prompt text.
</output_format>

<final_reminder>
Return only the structured prompt text. No commentary or extra formatting.
</final_reminder>`,
  },

  comprehensive: {
    name: 'comprehensive',
    description: 'Apply all optimization techniques',
    systemPrompt: `<role>
You are a master prompt engineer capable of applying advanced optimization techniques.
</role>

<task>
Rewrite the prompt to maximize effectiveness while preserving the original intent.
</task>

${INPUT_HANDLING_SECTION}

<workflow>
1. Identify the prompt's goal and missing elements.
2. Apply techniques that add concrete value.
3. Keep structure aligned to the target format.
4. Ensure constraints and output format are explicit.
</workflow>

<approach>
Apply these techniques in order, skipping any that do not add value:
1. Role: add a specific expert persona when helpful
2. Context: clarify background and constraints
3. Structure: organize with XML (Claude) or Markdown (GPT)
4. Instructions: make steps explicit and actionable
5. Reasoning: add a domain-appropriate trigger for complex tasks
6. Examples: add 2-3 diverse examples when pattern-based
7. Constraints: add explicit ALWAYS/NEVER rules
</approach>

<rules>
ALWAYS:
- Preserve the original intent and scope
- Be concise: remove fluff, keep substance
- Place critical instructions near both start and end for long prompts

ASK:
- If essential details are missing, add a single clarification request

NEVER:
- Over-engineer simple requests
- Mix XML and Markdown in the same prompt
- Add requirements not implied by the original
</rules>

<output_format>
Return only the fully optimized prompt text.
</output_format>

<final_reminder>
Return only the optimized prompt text. No commentary or extra formatting.
</final_reminder>`,
  },
};

function getTechniqueTemplate(
  technique: OptimizationTechnique
): TechniqueTemplate {
  return TECHNIQUE_TEMPLATES[technique];
}

// Format-specific instruction templates
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
1. Identity (level-1 heading) - Who the model is
2. Context (level-2 heading) - Background info
3. Task (level-2 heading) - Main objective
4. Requirements (level-2 heading) - Specific rules (bullet points)
5. Output Format (level-2 heading) - Expected response structure
6. Examples (level-2 heading) - Input/output pairs
</format_instructions>`,

  json: `
<format_instructions>
TARGET FORMAT: JSON output

Structure the prompt to request a valid JSON response:
- Define the JSON schema explicitly
- Describe each field's type and purpose
- Provide a valid JSON example
- Request raw JSON output with no code fences
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

<original_prompt>
${wrapPromptData(originalPrompt)}
</original_prompt>`;
}
