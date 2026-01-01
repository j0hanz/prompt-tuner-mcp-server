# PromptTuner MCP

<img src="docs/logo.png" alt="PromptTuner MCP Logo" width="200">

[![npm version](https://img.shields.io/npm/v/@j0hanz/prompt-tuner-mcp-server.svg)](https://www.npmjs.com/package/@j0hanz/prompt-tuner-mcp-server)
[![License](https://img.shields.io/npm/l/@j0hanz/prompt-tuner-mcp-server)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](https://nodejs.org/)

PromptTuner MCP is an MCP server that refines, analyzes, optimizes, and validates prompts using OpenAI, Anthropic, or Google Gemini.

## What it does

1. Validates and trims input prompts (enforces `MAX_PROMPT_LENGTH`).
2. Resolves the target format (`auto` uses heuristics; falls back to `gpt` if no format is detected).
3. Calls the selected provider with retry and timeout controls.
4. Validates and normalizes LLM output, falling back to stricter prompts or the `basic` technique when needed.
5. Returns human-readable text plus machine-friendly `structuredContent` (and resource blocks for refined/optimized outputs).

## Features

- Refine prompts with single techniques or full multi-technique optimization.
- Analyze quality with scores, characteristics, and actionable suggestions.
- Validate prompts for issues, token limits, and injection risks.
- Auto-detect target format (Claude XML, GPT Markdown, or JSON).
- Structured outputs with provider/model metadata, fallback indicators, and score normalization.
- Retry logic with exponential backoff for transient provider failures.
- Emits MCP progress notifications for `analyze_prompt` when a progress token is provided.

## Quick Start

PromptTuner runs over stdio only. The `dev:http` and `start:http` scripts are compatibility aliases (no HTTP transport yet).

### Claude Desktop

Add to `claude_desktop_config.json`:

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

> Replace the API key and provider with your preferred LLM. Only configure the key for the active provider.

## Configuration (Essentials)

PromptTuner reads configuration from environment variables. CLI flags can override them (run `prompt-tuner-mcp-server --help`). Full reference in `CONFIGURATION.md`.

| Variable            | Default          | Description                                    |
| ------------------- | ---------------- | ---------------------------------------------- |
| `LLM_PROVIDER`      | `openai`         | `openai`, `anthropic`, or `google`.            |
| `OPENAI_API_KEY`    | -                | Required when `LLM_PROVIDER=openai`.           |
| `ANTHROPIC_API_KEY` | -                | Required when `LLM_PROVIDER=anthropic`.        |
| `GOOGLE_API_KEY`    | -                | Required when `LLM_PROVIDER=google`.           |
| `LLM_MODEL`         | provider default | Override the default model.                    |
| `LLM_TIMEOUT_MS`    | `60000`          | Per-request timeout in milliseconds.           |
| `LLM_MAX_TOKENS`    | `8000`           | Upper bound for LLM outputs (tool caps apply). |
| `MAX_PROMPT_LENGTH` | `10000`          | Max trimmed prompt length (chars).             |

## CLI Options

CLI flags override environment variables (run `prompt-tuner-mcp-server --help`).

| Flag                           | Env var                 | Description                                 |
| ------------------------------ | ----------------------- | ------------------------------------------- | --------------------------------------- |
| `--log-format <text            | json>`                  | `LOG_FORMAT`                                | Override log format (currently unused). |
| `--debug / --no-debug`         | `DEBUG`                 | Enable/disable debug logging.               |
| `--include-error-context`      | `INCLUDE_ERROR_CONTEXT` | Include sanitized prompt snippet in errors. |
| `--llm-provider <provider>`    | `LLM_PROVIDER`          | `openai`, `anthropic`, or `google`.         |
| `--llm-model <name>`           | `LLM_MODEL`             | Override the default model.                 |
| `--llm-timeout-ms <number>`    | `LLM_TIMEOUT_MS`        | Override request timeout (ms).              |
| `--llm-max-tokens <number>`    | `LLM_MAX_TOKENS`        | Override output token cap.                  |
| `--max-prompt-length <number>` | `MAX_PROMPT_LENGTH`     | Override max prompt length (chars).         |

## Tools

All tools accept plain text, Markdown, or XML prompts. Responses include `content` (human-readable) and `structuredContent` (machine-readable).

### refine_prompt

Fix grammar, improve clarity, and apply a single technique.

| Parameter      | Type   | Required | Default | Notes                                                                             |
| -------------- | ------ | -------- | ------- | --------------------------------------------------------------------------------- |
| `prompt`       | string | Yes      | -       | Trimmed and length-checked.                                                       |
| `technique`    | string | No       | `basic` | `basic`, `chainOfThought`, `fewShot`, `roleBased`, `structured`, `comprehensive`. |
| `targetFormat` | string | No       | `auto`  | `auto`, `claude`, `gpt`, `json`. `auto` uses heuristics.                          |

Returns (structuredContent): `ok`, `original`, `refined`, `corrections`, `technique`, `targetFormat`, `usedFallback`, `provider`, `model`.

### analyze_prompt

Score prompt quality (0-100) and provide suggestions.

| Parameter | Type   | Required | Default | Notes                       |
| --------- | ------ | -------- | ------- | --------------------------- |
| `prompt`  | string | Yes      | -       | Trimmed and length-checked. |

Returns: `ok`, `hasTypos`, `isVague`, `missingContext`, `suggestions`, `score`, `characteristics`, `usedFallback`, `scoreAdjusted`, `overallSource`, `provider`, `model`.

### optimize_prompt

Apply multiple techniques sequentially and return before/after scores.

| Parameter      | Type     | Required | Default     | Notes                                                                                                                        |
| -------------- | -------- | -------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `prompt`       | string   | Yes      | -           | Trimmed and length-checked.                                                                                                  |
| `techniques`   | string[] | No       | `["basic"]` | 1-6 techniques; order preserved. `comprehensive` expands to `basic -> roleBased -> structured -> fewShot -> chainOfThought`. |
| `targetFormat` | string   | No       | `auto`      | `auto`, `claude`, `gpt`, `json`.                                                                                             |

Returns: `ok`, `original`, `optimized`, `techniquesApplied`, `targetFormat`, `beforeScore`, `afterScore`, `scoreDelta`, `improvements`, `usedFallback`, `scoreAdjusted`, `overallSource`, `provider`, `model`.

### validate_prompt

Pre-flight validation: issues, token estimate, and injection risks.

| Parameter        | Type    | Required | Default   | Notes                                                      |
| ---------------- | ------- | -------- | --------- | ---------------------------------------------------------- |
| `prompt`         | string  | Yes      | -         | Trimmed and length-checked.                                |
| `targetModel`    | string  | No       | `generic` | `claude`, `gpt`, `gemini`, `generic` (token limits below). |
| `checkInjection` | boolean | No       | `true`    | When true, security risks are flagged as errors.           |

Returns: `ok`, `isValid`, `issues`, `tokenEstimate`, `tokenLimit`, `tokenUtilization`, `overLimit`, `targetModel`, `securityFlags`, `provider`, `model`.

Token limits used for `validate_prompt`: `claude` 200000, `gpt` 128000, `gemini` 1000000, `generic` 8000.

## Response Format

- `content`: array of content blocks (human-readable Markdown text plus optional resources).
- `structuredContent`: machine-parseable results.
- Errors return `structuredContent.ok=false` and an `error` object with `code`, `message`, optional `context` (sanitized, up to 200 chars), `details`, and `recoveryHint`.
- Error responses also include `isError: true`.
- `refine_prompt` and `optimize_prompt` include a `resource` content block with a `file:///` URI and the prompt text in `resource.text` (Markdown).

## Prompts

| Name             | Description                                                     |
| ---------------- | --------------------------------------------------------------- |
| `quick-optimize` | Fast prompt improvement with grammar and clarity fixes.         |
| `deep-optimize`  | Comprehensive optimization using the `comprehensive` technique. |
| `analyze`        | Score prompt quality and return suggestions.                    |

All prompts accept a single argument: `{ "prompt": "..." }`.

## Prompt Optimization Workflow

### Technique selection guide

| Task type         | Recommended techniques         |
| ----------------- | ------------------------------ |
| Simple cleanup    | `basic`                        |
| Code tasks        | `roleBased` + `structured`     |
| Complex reasoning | `roleBased` + `chainOfThought` |
| Data extraction   | `structured` + `fewShot`       |
| Maximum quality   | `comprehensive`                |

### Recommended prompt architecture

1. Role or identity
2. Context or background
3. Task or objective
4. Steps or instructions
5. Requirements or constraints (ALWAYS or NEVER)
6. Output format
7. Examples (if helpful)
8. Final reminder

## Development

### Prerequisites

- Node.js >= 22.0.0
- npm

### Scripts

| Command                  | Description                                           |
| ------------------------ | ----------------------------------------------------- |
| `npm run build`          | Compile TypeScript and set permissions.               |
| `npm run prepare`        | Build on install (publishing helper).                 |
| `npm run dev`            | Run from source in watch mode.                        |
| `npm run dev:http`       | Alias of `npm run dev` (no HTTP transport yet).       |
| `npm run watch`          | TypeScript compiler in watch mode.                    |
| `npm run start`          | Run the compiled server from `dist/`.                 |
| `npm run start:http`     | Alias of `npm run start` (no HTTP transport yet).     |
| `npm run test`           | Run `node:test` once.                                 |
| `npm run test:coverage`  | Run `node:test` with experimental coverage.           |
| `npm run test:watch`     | Run `node:test` in watch mode.                        |
| `npm run lint`           | Run ESLint.                                           |
| `npm run format`         | Run Prettier.                                         |
| `npm run type-check`     | TypeScript type checking.                             |
| `npm run inspector`      | Run MCP Inspector against `dist/index.js`.            |
| `npm run inspector:http` | Alias of `npm run inspector` (no HTTP transport yet). |
| `npm run duplication`    | Run jscpd duplication report.                         |

## Project Structure

```text
src/
  index.ts        Entry point
  server.ts       MCP server setup (stdio transport)
  config/         Configuration and constants
  lib/            Shared utilities (LLM, retry, validation)
  tools/          Tool implementations
  prompts/        MCP prompt templates
  schemas/        Zod input/output schemas

tests/            node:test suites

dist/             Compiled output (generated)

docs/             Static assets
```

## Security

- API keys are supplied only via environment variables.
- Inputs are validated with Zod and additional length checks.
- Error context is sanitized and truncated when `INCLUDE_ERROR_CONTEXT=true`.
- Google safety filters can be disabled only via `GOOGLE_SAFETY_DISABLED=true`.

## Contributing

Pull requests are welcome. Please include a short summary, tests run, and note any configuration changes.

## License

MIT License. See `LICENSE` for details.
