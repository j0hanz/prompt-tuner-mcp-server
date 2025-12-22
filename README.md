# PromptTuner MCP

<img src="docs/logo.png" alt="PromptTuner MCP Logo" width="200">

[![npm version](https://img.shields.io/npm/v/@j0hanz/prompt-tuner-mcp-server.svg)](https://www.npmjs.com/package/@j0hanz/prompt-tuner-mcp-server)
[![License](https://img.shields.io/npm/l/@j0hanz/prompt-tuner-mcp-server)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)

An MCP server that helps you write better prompts for AI assistants. It analyzes, refines, and optimizes prompts to improve AI understanding and response quality.

## ✨ Features

| Feature                | Description                                                                                |
| :--------------------- | :----------------------------------------------------------------------------------------- |
| 🔧 **Refine Prompts**  | Fix grammar, improve clarity, and apply optimization techniques like Chain-of-Thought.     |
| 📊 **Analyze Quality** | Score prompts (0-100) on clarity, specificity, completeness, structure, and effectiveness. |
| 🚀 **Optimize**        | Apply multiple techniques sequentially for comprehensive improvement.                      |
| 🔍 **Detect Format**   | Identify if a prompt targets Claude XML, GPT Markdown, or JSON.                            |
| ⚖️ **Compare**         | A/B test two prompt versions with side-by-side scoring and diffs.                          |
| ✅ **Validate**        | Pre-flight checks for anti-patterns, token limits, and security risks.                     |
| 📚 **Templates**       | Access a library of best-practice prompt templates for coding, writing, and analysis.      |

## 🎯 When to Use

- **Before sending a prompt**: Use `refine_prompt` to fix typos and vague language.
- **When results are poor**: Use `analyze_prompt` to understand why the AI is struggling.
- **For complex tasks**: Use `optimize_prompt` with "comprehensive" techniques.
- **For A/B testing**: Use `compare_prompts` to choose the best version.
- **For security**: Use `validate_prompt` to check for injection risks.

## 🚀 Quick Start

The easiest way to run PromptTuner is using `npx`.

### Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "prompttuner": {
      "command": "npx",
      "args": ["-y", "@j0hanz/prompt-tuner-mcp-server@latest"],
      "env": {
        "LLM_PROVIDER": "openai",
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

> **Note**: Replace `OPENAI_API_KEY` with `ANTHROPIC_API_KEY` or `GOOGLE_API_KEY` depending on your `LLM_PROVIDER` choice.

## 📦 Installation

### NPX (Recommended)

```bash
npx -y @j0hanz/prompt-tuner-mcp-server@latest
```

### Global Installation

```bash
npm install -g @j0hanz/prompt-tuner-mcp-server
```

### From Source

```bash
git clone https://github.com/j0hanz/prompt-tuner-mcp-server.git
cd prompt-tuner-mcp-server
npm install
npm run build
```

## ⚙️ Configuration

### Environment Variables

PromptTuner requires an API key from an LLM provider to perform analysis and refinement.

| Variable                 | Default            | Description                                                       |
| :----------------------- | :----------------- | :---------------------------------------------------------------- |
| `LLM_PROVIDER`           | `openai`           | Provider to use: `openai`, `anthropic`, or `google`.              |
| `OPENAI_API_KEY`         | -                  | API key for OpenAI.                                               |
| `ANTHROPIC_API_KEY`      | -                  | API key for Anthropic.                                            |
| `GOOGLE_API_KEY`         | -                  | API key for Google Gemini.                                        |
| `LLM_MODEL`              | (provider default) | Override the default model (e.g., `gpt-4o`, `claude-3-5-sonnet`). |
| `MAX_PROMPT_LENGTH`      | `10000`            | Maximum characters allowed in a prompt.                           |
| `LLM_TIMEOUT_MS`         | `60000`            | Timeout for LLM requests in milliseconds.                         |
| `LLM_MAX_TOKENS`         | `8000`             | Maximum tokens for LLM response.                                  |
| `GOOGLE_SAFETY_DISABLED` | `false`            | Disable Google Gemini safety filters (`true`/`false`).            |

> For advanced configuration (retries, caching, logging), see [CONFIGURATION.md](CONFIGURATION.md).

## 🔧 Tools

### `refine_prompt`

Fix grammar, improve clarity, and apply optimization techniques. Use when: user asks to fix/improve/optimize a prompt, prompt has typos, or prompt is vague.

| Parameter      | Type   | Required | Default   | Description                                                                                  |
| :------------- | :----- | :------- | :-------- | :------------------------------------------------------------------------------------------- |
| `prompt`       | string | ✅       | -         | Prompt text to improve (plain text, Markdown, or XML).                                       |
| `technique`    | string | ❌       | `"basic"` | Technique: `basic`, `chainOfThought`, `fewShot`, `roleBased`, `structured`, `comprehensive`. |
| `targetFormat` | string | ❌       | `"auto"`  | Output format: `auto`, `claude`, `gpt`, `json`.                                              |

**Returns:** Refined prompt text and details about changes made.

### `analyze_prompt`

Score prompt quality (0-100) across 5 dimensions using AI analysis: clarity, specificity, completeness, structure, effectiveness. Returns actionable suggestions.

| Parameter | Type   | Required | Default | Description                                            |
| :-------- | :----- | :------- | :------ | :----------------------------------------------------- |
| `prompt`  | string | ✅       | -       | Prompt text to improve (plain text, Markdown, or XML). |

**Returns:** Scores, characteristics (typos, vague language), and improvement suggestions.

### `optimize_prompt`

Apply multiple optimization techniques using AI (e.g., `["basic", "roleBased", "structured"]`). Returns before/after scores and improvements.

| Parameter      | Type   | Required | Default     | Description                                            |
| :------------- | :----- | :------- | :---------- | :----------------------------------------------------- |
| `prompt`       | string | ✅       | -           | Prompt text to improve (plain text, Markdown, or XML). |
| `techniques`   | array  | ❌       | `["basic"]` | Array of techniques to apply.                          |
| `targetFormat` | string | ❌       | `"auto"`    | Output format: `auto`, `claude`, `gpt`, `json`.        |

**Returns:** Optimized prompt, before/after scores, and list of improvements.

### `detect_format`

Identify if prompt targets Claude XML, GPT Markdown, or JSON schema using AI analysis. Returns confidence score and recommendations.

| Parameter | Type   | Required | Default | Description             |
| :-------- | :----- | :------- | :------ | :---------------------- |
| `prompt`  | string | ✅       | -       | Prompt text to analyze. |

**Returns:** Detected format (`claude`, `gpt`, `json`, `auto`), confidence score, and recommendation.

### `compare_prompts`

Compare two prompt versions using AI analysis. Returns scores, winner, improvements/regressions, and recommendations.

| Parameter | Type   | Required | Default      | Description               |
| :-------- | :----- | :------- | :----------- | :------------------------ |
| `promptA` | string | ✅       | -            | First prompt to compare.  |
| `promptB` | string | ✅       | -            | Second prompt to compare. |
| `labelA`  | string | ❌       | `"Prompt A"` | Label for first prompt.   |
| `labelB`  | string | ❌       | `"Prompt B"` | Label for second prompt.  |

**Returns:** Comparison report with scores, winner, and detailed analysis.

### `validate_prompt`

Pre-flight validation using AI: checks issues, estimates tokens, detects security risks. Returns isValid boolean and categorized issues.

| Parameter        | Type    | Required | Default     | Description                                             |
| :--------------- | :------ | :------- | :---------- | :------------------------------------------------------ |
| `prompt`         | string  | ✅       | -           | Prompt to validate.                                     |
| `targetModel`    | string  | ❌       | `"generic"` | Target AI model (`claude`, `gpt`, `gemini`, `generic`). |
| `checkInjection` | boolean | ❌       | `true`      | Check for prompt injection patterns.                    |

**Returns:** Validation status, token estimate, and list of issues (errors, warnings, info).

## 📚 Resources

| URI Pattern                     | Description                                                                                                       |
| :------------------------------ | :---------------------------------------------------------------------------------------------------------------- |
| `templates://catalog`           | List of all available prompt templates by category.                                                               |
| `templates://{category}/{name}` | Get a specific prompt template (e.g., `templates://coding/code-review`, `templates://coding/mcp-ts-boilerplate`). |

## 💬 Prompts

| Name                   | Description                                                           |
| :--------------------- | :-------------------------------------------------------------------- |
| `quick-optimize`       | Fast prompt improvement with grammar and clarity fixes.               |
| `deep-optimize`        | Comprehensive optimization with all techniques applied.               |
| `analyze`              | Score prompt quality and get improvement suggestions.                 |
| `review`               | Check prompt against prompting best practices.                        |
| `iterative-refine`     | Identify top 3 weaknesses and fix them iteratively.                   |
| `recommend-techniques` | Recommend best optimization techniques based on prompt and task type. |
| `scan-antipatterns`    | Detect common prompt anti-patterns and provide corrections.           |

## 🔌 Client Configuration

<details>
<summary><b>VS Code (Claude Dev / Cline)</b></summary>

Add to your VS Code settings or extension configuration:

```json
{
  "mcpServers": {
    "prompttuner": {
      "command": "npx",
      "args": ["-y", "@j0hanz/prompt-tuner-mcp-server@latest"],
      "env": {
        "LLM_PROVIDER": "openai",
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

</details>

<details>
<summary><b>Claude Desktop</b></summary>

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "prompttuner": {
      "command": "npx",
      "args": ["-y", "@j0hanz/prompt-tuner-mcp-server@latest"],
      "env": {
        "LLM_PROVIDER": "anthropic",
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

</details>

<details>
<summary><b>Cursor</b></summary>

Add to Cursor MCP settings:

```json
{
  "mcpServers": {
    "prompttuner": {
      "command": "npx",
      "args": ["-y", "@j0hanz/prompt-tuner-mcp-server@latest"],
      "env": {
        "LLM_PROVIDER": "openai",
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

</details>

## 🔒 Security

- **API Keys**: API keys are passed via environment variables and are never logged or exposed in outputs.
- **Input Validation**: All inputs are validated using Zod schemas to prevent injection and malformed data.
- **Prompt Injection**: The `validate_prompt` tool specifically checks for prompt injection patterns.
- **Sanitization**: User inputs reflected in error messages are sanitized.

## 🛠️ Development

### Prerequisites

- Node.js >= 20.0.0
- npm

### Scripts

| Command              | Description                                        |
| :------------------- | :------------------------------------------------- |
| `npm run build`      | Compile TypeScript and set permissions.            |
| `npm run dev`        | Run in watch mode for development.                 |
| `npm run test`       | Run Vitest tests.                                  |
| `npm run lint`       | Run ESLint.                                        |
| `npm run type-check` | Run TypeScript type checking.                      |
| `npm run inspector`  | Run the MCP Inspector to test tools interactively. |

### Project Structure

```text
src/
├── index.ts          # Entry point
├── server.ts         # MCP server setup
├── config/           # Configuration and types
├── lib/              # Shared utilities (LLM, cache, errors)
├── tools/            # Tool implementations
├── resources/        # Resource implementations
├── prompts/          # Prompt implementations
└── schemas/          # Zod input/output schemas
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
