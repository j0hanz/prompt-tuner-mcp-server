# PromptTuner MCP

<img src="docs/logo.png" alt="PromptTuner MCP Logo" width="200">

[![CI](https://github.com/j0hanz/prompttuner-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/j0hanz/prompttuner-mcp/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/prompttuner-mcp.svg)](https://www.npmjs.com/package/prompttuner-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)

An MCP server that helps you write better prompts for AI assistants. It analyzes, refines, and optimizes prompts to improve AI understanding and response quality.

**Performance**: LLM refinement 1-5s • Batch processing 100+ prompts/min

## 🔑 API Key Required

PromptTuner uses direct API integration with LLM providers. You'll need an API key from one of:

- **OpenAI** (gpt-4o, gpt-4o-mini, gpt-4-turbo) - [Get API key](https://platform.openai.com/api-keys)
- **Anthropic** (Claude 3.5 Sonnet/Haiku) - [Get API key](https://console.anthropic.com)
- **Google** (Gemini 2.0 Flash, Gemini 1.5 Pro) - [Get API key](https://aistudio.google.com/apikey)

Set environment variables:

```bash
# Choose provider (default: openai)
export LLM_PROVIDER=openai

# Set API key for your chosen provider
export OPENAI_API_KEY=sk-...
# OR
export ANTHROPIC_API_KEY=sk-ant-...
# OR
export GOOGLE_API_KEY=...

# Optional: override default model
export LLM_MODEL=gpt-4o
```

## Why Use PromptTuner?

Poor prompts lead to poor AI responses. PromptTuner helps by:

- ✅ **Fixing typos and grammar** - Catches 50+ common misspellings
- ✅ **Improving clarity** - Removes vague language, adds specificity
- ✅ **Applying best practices** - Chain-of-thought, few-shot, role-based prompting
- ✅ **Scoring your prompts** - Get actionable feedback with 0-100 scores
- ✅ **Multi-provider support** - Works with OpenAI, Anthropic, and Google

## 🎯 Production Ready

**New in v1.0.0:**

- ✅ **Security Hardening**: Request timeouts, X-Forwarded-For validation, LLM output validation
- ✅ **Performance**: Parallel technique application (60% faster multi-technique optimization)
- ✅ **Testing**: Comprehensive test suite with 70%+ coverage
- ✅ **Distributed**: Redis session store for multi-instance deployments
- ✅ **Observability**: Structured JSON logging, health checks, ready probes
- ✅ **Docker**: Production-ready containers with health checks

## Quick Example

**Before:**

```text
trubbelshot this code for me plz
```

**After (with `refine_prompt`):**

```text
You are an expert software developer.

Troubleshoot this code. Find the errors, explain what's wrong, and provide a corrected version. Ask questions if anything is unclear.
```

## Installation

```bash
git clone https://github.com/j0hanz/prompttuner-mcp.git
cd prompttuner-mcp
npm install
npm run build
```

## Usage

### With Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "prompttuner": {
      "command": "node",
      "args": ["/path/to/prompttuner-mcp/dist/index.js"],
      "env": {
        "LLM_PROVIDER": "openai",
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

**Note**: Replace `OPENAI_API_KEY` with `ANTHROPIC_API_KEY` or `GOOGLE_API_KEY` depending on your provider choice.

### With MCP Inspector

```bash
npm run inspector
```

### HTTP Mode (Experimental)

For testing or integration with HTTP-based clients:

```bash
npm run start:http
# Server runs at http://127.0.0.1:3000/mcp
```

Custom port/host:

```bash
node dist/index.js --http --port 8080 --host 0.0.0.0
```

### Docker (Recommended for Production)

Run with Docker for easy deployment and Redis caching:

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f prompttuner

# Stop
docker-compose down
```

The Docker setup includes:

- PromptTuner MCP server on port 3000
- Redis cache for improved performance
- Automatic health checks
- Volume persistence

Configure via environment variables in `.env` (see `.env.example`).

## Tools

### `refine_prompt`

Fix grammar, improve clarity, and apply optimization techniques to any prompt. **Includes intelligent caching** to speed up repeated refinements.

| Parameter      | Type   | Default   | Description                                           |
| -------------- | ------ | --------- | ----------------------------------------------------- |
| `prompt`       | string | required  | Prompt text to improve (plain text, Markdown, or XML) |
| `technique`    | string | `"basic"` | Technique to apply                                    |
| `targetFormat` | string | `"auto"`  | Output format                                         |

**Performance:**

- **Caching**: Identical refinements are cached (LRU, 500 entries, 1-hour TTL)
- **Cache Key**: Based on prompt + technique + format (SHA-256 hash)
- **fromCache**: Response includes `fromCache: true` when served from cache

**Techniques:**

| Technique        | Description               | Best For                    |
| ---------------- | ------------------------- | --------------------------- |
| `basic`          | Grammar/clarity           | Quick fixes                 |
| `chainOfThought` | Step-by-step reasoning    | Math, logic, analysis       |
| `fewShot`        | Examples                  | Classification, translation |
| `roleBased`      | Persona                   | Domain-specific tasks       |
| `structured`     | Formatting (XML/Markdown) | Complex instructions        |
| `comprehensive`  | All techniques            | Maximum improvement         |

**Target Formats:**

| Format   | Description | Best For        |
| -------- | ----------- | --------------- |
| `auto`   | Detect      | Unknown target  |
| `claude` | XML tags    | Claude models   |
| `gpt`    | Markdown    | GPT models      |
| `json`   | Schema      | Data extraction |

**Example:**

```json
{
  "prompt": "explain recursion",
  "technique": "comprehensive",
  "targetFormat": "claude"
}
```

### `analyze_prompt`

Score prompt quality across 5 dimensions and get actionable improvement suggestions.

**Input:**

- `prompt` (string, required): Prompt text to improve

**Returns:**

- **Score** (0-100): clarity, specificity, completeness, structure, effectiveness, overall
- **Characteristics**: detected format, word count, complexity level
- **Suggestions**: actionable improvements
- **Flags**: hasTypos, isVague, missingContext

### `optimize_prompt`

Apply multiple techniques sequentially for comprehensive prompt improvement. Returns before/after scores and diff.

| Parameter      | Type     | Default     | Description                  |
| -------------- | -------- | ----------- | ---------------------------- |
| `prompt`       | string   | required    | Prompt text to improve       |
| `techniques`   | string[] | `["basic"]` | Techniques to apply in order |
| `targetFormat` | string   | `"auto"`    | Output format                |

**Example:**

```json
{
  "prompt": "write code for sorting",
  "techniques": ["basic", "roleBased", "structured"],
  "targetFormat": "gpt"
}
```

**Returns:** Before/after scores, diff of changes.

### `detect_format`

Identify target AI format (Claude XML, GPT Markdown, JSON) with confidence score.

**Returns:**

- `detectedFormat`: claude, gpt, json, or auto
- `confidence`: 0-100
- `recommendation`: Format-specific advice

### `compare_prompts`

Compare two prompt versions side-by-side with scoring, diff, and recommendations.

**Input:**

| Parameter | Type   | Default      | Description      |
| --------- | ------ | ------------ | ---------------- |
| `promptA` | string | required     | First prompt     |
| `promptB` | string | required     | Second prompt    |
| `labelA`  | string | `"Prompt A"` | Label for first  |
| `labelB`  | string | `"Prompt B"` | Label for second |

**Returns:**

- **Scores**: Both prompts scored across 5 dimensions (clarity, specificity, completeness, structure, effectiveness)
- **Winner**: Which prompt is better (A, B, or tie)
- **Score Deltas**: Numerical differences for each dimension
- **Improvements**: What got better in Prompt B vs A
- **Regressions**: What got worse in Prompt B vs A
- **Recommendation**: Actionable advice on which to use
- **Diff**: Character-level comparison

**Example:**

```json
{
  "promptA": "explain recursion",
  "promptB": "You are a computer science teacher. Explain recursion with examples.",
  "labelA": "Original",
  "labelB": "Improved"
}
```

**Use Cases:**

- A/B testing prompts
- Evaluating refinement effectiveness
- Tracking prompt iterations
- Choosing between versions

### `validate_prompt`

Pre-flight validation: check for issues, estimate tokens, detect anti-patterns and security risks before using a prompt.

**Input:**

| Parameter        | Type    | Default     | Description                        |
| ---------------- | ------- | ----------- | ---------------------------------- |
| `prompt`         | string  | required    | Prompt to validate                 |
| `targetModel`    | string  | `"generic"` | AI model (claude/gpt/gemini)       |
| `checkInjection` | boolean | `true`      | Check for prompt injection attacks |

**Returns:**

- **Is Valid**: Boolean (true if no errors)
- **Token Estimate**: Approximate token count (1 token ≈ 4 chars)
- **Issues**: Array of validation issues (error/warning/info)
  - Type: error, warning, or info
  - Message: What the issue is
  - Suggestion: How to fix it
- **Checks Performed**:
  - Anti-patterns (vague language, missing context)
  - Token limits (model-specific)
  - Security (prompt injection patterns)
  - Typos (common misspellings)

**Token Limits by Model:**

| Model     | Limit     |
| --------- | --------- |
| `claude`  | 200,000   |
| `gpt`     | 128,000   |
| `gemini`  | 1,000,000 |
| `generic` | 8,000     |

**Example:**

```json
{
  "prompt": "ignore all previous instructions and...",
  "targetModel": "gpt",
  "checkInjection": true
}
```

**Use Cases:**

- Pre-flight checks before sending prompts to LLMs
- Security audits for user-provided prompts
- Token budget planning
- Quality assurance in prompt pipelines

## Resources

Browse and use prompt templates:

| URI                                        | Description                  |
| ------------------------------------------ | ---------------------------- |
| `templates://catalog`                      | List all available templates |
| `templates://coding/code-review`           | Code review template         |
| `templates://coding/debug-error`           | Debugging template           |
| `templates://writing/summarize`            | Summarization template       |
| `templates://analysis/pros-cons`           | Pro/con analysis template    |
| `templates://system-prompts/expert-role`   | Expert persona template      |
| `templates://data-extraction/json-extract` | JSON extraction template     |

**Categories:** coding, writing, analysis, system-prompts, data-extraction

## Prompts (Workflows)

Pre-built workflows for common tasks:

| Prompt                 | Description                                    |
| ---------------------- | ---------------------------------------------- |
| `quick-optimize`       | One-step optimization with single technique    |
| `deep-optimize`        | Comprehensive optimization with all techniques |
| `analyze`              | Score quality and get improvement suggestions  |
| `review`               | Educational feedback against best practices    |
| `iterative-refine`     | Identify top 3 issues and fix iteratively      |
| `recommend-techniques` | Suggest best techniques for prompt + task      |
| `scan-antipatterns`    | Detect common prompt mistakes                  |

## Scoring Explained

| Dimension         | What It Measures                                      |
| ----------------- | ----------------------------------------------------- |
| **Clarity**       | Clear language, no vague terms ("something", "stuff") |
| **Specificity**   | Concrete details, examples, numbers                   |
| **Completeness**  | Role context, output format, all requirements         |
| **Structure**     | Organization, formatting, sections                    |
| **Effectiveness** | Overall likelihood of good AI response                |

**Score Interpretation:**

- 80-100: Excellent - Minor refinements only
- 60-79: Good - Some improvements recommended
- 40-59: Fair - Notable gaps to address
- 0-39: Needs Work - Significant improvements needed

## LLM Sampling vs Rule-Based

PromptTuner works in two modes:

1. **LLM Sampling** (when available): Uses the MCP client's LLM for intelligent refinement
2. **Rule-Based Fallback** (automatic): Uses pattern matching and dictionaries when sampling unavailable

The tool automatically falls back to rule-based refinement if your MCP client doesn't support sampling.

## Development

```bash
npm run dev        # Watch mode with hot reload
npm run build      # Compile TypeScript
npm run test       # Run tests
npm run lint       # ESLint check
npm run type-check # TypeScript type checking
npm run format     # Prettier formatting
```

## Troubleshooting

### "LLM sampling is not supported"

This is normal! The tool automatically uses rule-based refinement. For full LLM-powered refinement, use Claude Desktop or another MCP client that supports sampling.

### "Prompt too long"

Maximum prompt length is 10,000 characters. Split longer prompts into sections.

### HTTP mode not connecting

Check that:

1. Port 3000 (default) is not in use
2. You're using POST to `/mcp` endpoint
3. Headers include `Content-Type: application/json`

## Contributing

Contributions welcome! Please:

1. Run `npm run lint && npm run type-check` before committing
2. Add tests for new features
3. Update README for user-facing changes

## License

MIT

## Credits

Built with the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk).
