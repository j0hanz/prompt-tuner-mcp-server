export const SERVER_INSTRUCTIONS = `# PromptTuner MCP

A lean prompt editing toolkit.

## Tools

### fix_prompt
Fix spelling and grammar only.

**Input:**
\`\`\`json
{ "prompt": "..." }
\`\`\`

### boost_prompt
Improve a prompt to be clearer and more effective.

**Input:**
\`\`\`json
{ "prompt": "..." }
\`\`\`

## Prompts

- \`fix\` - Generates a message asking to fix grammar/spelling.
- \`boost\` - Generates a message asking to improve a prompt.
`;
