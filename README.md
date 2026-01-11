# PromptTuner MCP

<img src="docs/logo.png" alt="PromptTuner MCP Logo" width="200">

[![npm version](https://img.shields.io/npm/v/@j0hanz/prompt-tuner-mcp-server.svg)](https://www.npmjs.com/package/@j0hanz/prompt-tuner-mcp-server)
[![License](https://img.shields.io/npm/l/@j0hanz/prompt-tuner-mcp-server)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](https://nodejs.org/)

PromptTuner MCP is an MCP server that fixes and boosts prompts using OpenAI, Anthropic, or Google Gemini.

## What it does

1. Validates and trims input prompts (enforces `MAX_PROMPT_LENGTH`).
2. Calls the selected provider.
3. Normalizes LLM output (strips code fences / labels if present).
4. Returns human-readable text plus machine-friendly `structuredContent`.

## Features

- Fix spelling and grammar only (`fix_prompt`).
- Boost and enhance a prompt for clarity and effectiveness (`boost_prompt`).
- Simple structured outputs.
- Retry logic with exponential backoff for transient provider failures.

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

### fix_prompt

Fix spelling and grammar only.

| Parameter | Type   | Required | Notes                       |
| --------- | ------ | -------- | --------------------------- |
| `prompt`  | string | Yes      | Trimmed and length-checked. |

Returns: `ok`, `fixed`.

### boost_prompt

Refine and enhance a prompt for clarity and effectiveness.

| Parameter | Type   | Required | Notes                       |
| --------- | ------ | -------- | --------------------------- |
| `prompt`  | string | Yes      | Trimmed and length-checked. |

Returns: `ok`, `boosted`.

## Response Format

- `content`: array of content blocks (human-readable Markdown text plus optional resources).
- `structuredContent`: machine-parseable results.
- Errors return `structuredContent.ok=false` and an `error` object with `code`, `message`, optional `context` (sanitized, up to 200 chars), `details`, and `recoveryHint`.
- Error responses also include `isError: true`.

## Prompts

| Name    | Description                                   |
| ------- | --------------------------------------------- |
| `fix`   | Fix spelling and grammar only.                |
| `boost` | Boost a prompt for clarity and effectiveness. |

All prompts accept a single argument: `{ "prompt": "..." }`.

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
