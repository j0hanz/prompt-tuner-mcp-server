export const SERVER_INSTRUCTIONS = `# PromptTuner MCP

A prompt engineering toolkit for refining, analyzing, and validating prompts using modern best practices.

## Quick Start

| Goal | Tool | When to Use |
|------|------|-------------|
| Quick fix | \`refine_prompt\` | Fix typos and clarity issues |
| Deep optimization | \`optimize_prompt\` | Apply multiple techniques |
| Quality check | \`analyze_prompt\` | Get scores and suggestions |
| Format detection | \`detect_format\` | Check Claude/GPT/JSON format |
| Safety check | \`validate_prompt\` | Find issues and estimate tokens |
| A/B comparison | \`compare_prompts\` | Compare two prompt versions |

## Tools

### refine_prompt
Improves a prompt using a single optimization technique.

**Techniques:**
- \`basic\` (default) - Fix grammar, spelling, and clarity
- \`chainOfThought\` - Add step-by-step reasoning guidance
- \`fewShot\` - Add input/output examples
- \`roleBased\` - Add expert persona/role context
- \`structured\` - Add XML (Claude) or Markdown (GPT) structure
- \`comprehensive\` - Apply all techniques intelligently

**Example:**
\`\`\`json
{ "prompt": "help me code", "technique": "roleBased", "targetFormat": "claude" }
\`\`\`

### analyze_prompt
Scores your prompt (0-100) across clarity, specificity, completeness, structure, and effectiveness.

### optimize_prompt
Chains multiple techniques for maximum improvement and returns before/after scores plus improvements.

**Example:**
\`\`\`json
{ "prompt": "write code", "techniques": ["basic", "roleBased", "structured"] }
\`\`\`

### detect_format
Identifies the target format (Claude XML, GPT Markdown, or JSON) with confidence and recommendation.

### validate_prompt
Checks for prompt issues, estimates token usage, and optionally detects injection risks.

### compare_prompts
Compares two prompt versions with scores, winner, and recommendations.

## Target Formats

| Format | Best For | Structure |
|--------|----------|-----------|
| \`claude\` | Anthropic Claude | XML tags: \`<context>\`, \`<task>\`, \`<requirements>\` |
| \`gpt\` | OpenAI GPT | Markdown: \`## Context\`, \`## Task\`, \`**bold**\` |
| \`json\` | Structured output | JSON schema specification |
| \`auto\` | Auto-detect | Analyzes prompt to determine best format |

## Technique Selection Guide

| Task Type | Recommended Techniques |
|-----------|----------------------|
| Simple query | \`basic\` only |
| Code task | \`roleBased\` + \`structured\` |
| Complex analysis | \`roleBased\` + \`chainOfThought\` |
| Data extraction | \`structured\` + \`fewShot\` |
| Creative writing | \`roleBased\` + \`fewShot\` |
| Maximum quality | \`comprehensive\` |

## Resources
- \`templates://catalog\` - Browse all template categories
- \`templates://{category}/{name}\` - Get specific templates

**Categories:** coding, writing, analysis, system-prompts, data-extraction

## Workflow Prompts
- \`quick-optimize\` - Single-step refinement
- \`deep-optimize\` - Comprehensive optimization
- \`analyze\` - Quality analysis + format detection
- \`review\` - Best-practices review
- \`iterative-refine\` - Iterative improvement cycle
- \`recommend-techniques\` - Technique recommendations
- \`scan-antipatterns\` - Anti-pattern audit

## Modern Best Practices (2024-2025)

1. **Be Specific** - Replace vague words with concrete terms
2. **Add Role Context** - Use specific expert personas
3. **Use Structure** - XML for Claude, Markdown for GPT (never mix)
4. **Show Examples** - 2-3 diverse examples for pattern tasks
5. **Add Constraints** - Clear ALWAYS/NEVER rules
6. **Specify Output** - Define the expected format explicitly
7. **Enable Reasoning** - Add task-specific reasoning triggers when needed
8. **Place Key Instructions Twice** - Start and end for long prompts

## Prompt Architecture (Recommended Order)
\`\`\`
1. Role/Identity (if applicable)
2. Context/Background
3. Task/Objective
4. Instructions/Steps
5. Requirements/Constraints (ALWAYS/NEVER)
6. Output Format
7. Examples (if helpful)
8. Final Reminder (reiterate critical instruction)
\`\`\``;
