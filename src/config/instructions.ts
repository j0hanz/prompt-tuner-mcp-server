// Server instructions for MCP protocol
// Based on 2024-2025 prompt engineering best practices

export const SERVER_INSTRUCTIONS = `# PromptTuner MCP

A professional prompt engineering toolkit that helps you write better prompts for AI assistants using modern best practices from Anthropic, OpenAI, and industry leaders.

## Quick Start

| Goal | Tool | When to Use |
|------|------|-------------|
| Quick fix | \`refine_prompt\` | Fix typos, improve clarity |
| Deep optimization | \`optimize_prompt\` | Apply multiple techniques |
| Quality check | \`analyze_prompt\` | Get scores and suggestions |
| Format detection | \`detect_format\` | Check Claude/GPT compatibility |

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
Scores your prompt (0-100) across five dimensions:
- **Clarity** - Is the intent clear and unambiguous?
- **Specificity** - Are requirements well-defined?
- **Completeness** - Is context and output format specified?
- **Structure** - Is it well-organized?
- **Effectiveness** - Will it produce good results?

Returns actionable suggestions for improvement.

### optimize_prompt
Chains multiple techniques for maximum improvement. Shows before/after scores and a diff of changes.

**Example:**
\`\`\`json
{ "prompt": "write code", "techniques": ["basic", "roleBased", "structured"] }
\`\`\`

### detect_format
Identifies the target format (Claude XML, GPT Markdown, or JSON) with confidence score and recommendation.

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
- \`quick-optimize\` - Single-step optimization
- \`full-analysis\` - Comprehensive review with scoring
- \`convert-format\` - Transform to target format
- \`best-practices-review\` - Educational feedback
- \`iterative-improve\` - Multi-technique enhancement

## Modern Best Practices (2024-2025)

### Core Principles
1. **Be Specific** - Replace vague words ("something", "stuff", "etc.") with concrete terms
2. **Add Role Context** - "You are a senior engineer with expertise in..." activates domain knowledge
3. **Use Structure** - XML tags for Claude, Markdown for GPT (never mix)
4. **Show Examples** - 2-3 diverse examples demonstrate desired format
5. **Add Constraints** - Use ALWAYS/NEVER/MUST patterns for clear boundaries
6. **Specify Output** - Define exactly what format and structure you expect
7. **Enable Reasoning** - Use task-specific CoT triggers for complex tasks

### Advanced Techniques (from OpenAI & Anthropic Research)
8. **Place Instructions Twice** - For long prompts, put key instructions at BOTH beginning AND end
9. **Use Semantic Tags** - Claude: \`<context>\`, \`<task>\`, \`<requirements>\`, \`<output_format>\`
10. **Be Literal** - Modern models follow instructions more literally; be precise
11. **Add Quality Checks** - Include verification steps for important outputs
12. **Avoid Generic Roles** - "Helpful assistant" provides no benefit; use specific expert roles

### Prompt Architecture (Recommended Order)
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
