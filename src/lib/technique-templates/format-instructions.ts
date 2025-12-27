import type { TargetFormat } from '../../config/types.js';

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

export function getFormatInstructions(format: TargetFormat): string {
  if (format === 'auto') return '';
  return FORMAT_INSTRUCTIONS[format];
}
