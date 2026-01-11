# PromptTuner MCP

<img src="docs/logo.png" alt="PromptTuner MCP Logo" width="200">

[![npm version](https://img.shields.io/npm/v/@j0hanz/prompt-tuner-mcp-server.svg)](https://www.npmjs.com/package/@j0hanz/prompt-tuner-mcp-server)
[![License](https://img.shields.io/npm/l/@j0hanz/prompt-tuner-mcp-server)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](https://nodejs.org/)

PromptTuner MCP is an MCP server that fixes and boosts prompts using OpenAI, Anthropic, or Google Gemini.

## What it does

1. Validates and trims input prompts (enforces `MAX_PROMPT_LENGTH`).
2. Wraps the prompt as JSON inside sentinel markers (sanitizing markers, bidi control chars, and null bytes).
3. Calls the selected provider.
4. Normalizes LLM output (strips code fences / labels if present).
5. Returns human-readable text plus machine-friendly `structuredContent`.

## Features

- Polish and refine a prompt for clarity and flow (`fix_prompt`).
- Boost and enhance a prompt for clarity and effectiveness (`boost_prompt`).
- Craft a reusable workflow prompt for complex tasks (`crafting_prompt`).
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

## Configuration

PromptTuner uses minimal configuration. Set the provider and API key, and you're ready to go.

| Variable            | Default  | Description                                                             |
| ------------------- | -------- | ----------------------------------------------------------------------- |
| `LLM_PROVIDER`      | `openai` | `openai`, `anthropic`, or `google`.                                     |
| `OPENAI_API_KEY`    | -        | Required for `fix_prompt`/`boost_prompt` when `LLM_PROVIDER=openai`.    |
| `ANTHROPIC_API_KEY` | -        | Required for `fix_prompt`/`boost_prompt` when `LLM_PROVIDER=anthropic`. |
| `GOOGLE_API_KEY`    | -        | Required for `fix_prompt`/`boost_prompt` when `LLM_PROVIDER=google`.    |
| `LLM_MODEL`         | -        | Override the default model.                                             |
| `DEBUG`             | `false`  | Enable debug logging.                                                   |

All tools are LLM-backed and require an API key for the selected provider.

### Default Models

| Provider    | Default Model                |
| ----------- | ---------------------------- |
| `openai`    | `gpt-4o`                     |
| `anthropic` | `claude-3-5-sonnet-20241022` |
| `google`    | `gemini-2.0-flash-exp`       |

## CLI Options

| Flag                        | Description                         |
| --------------------------- | ----------------------------------- |
| `-h, --help`                | Show help text.                     |
| `-v, --version`             | Print version.                      |
| `--debug / --no-debug`      | Enable/disable debug logging.       |
| `--llm-provider <provider>` | `openai`, `anthropic`, or `google`. |
| `--llm-model <name>`        | Override the default model.         |

## Tools

All tools accept plain text, Markdown, or XML prompts. Responses include `content` (human-readable) and `structuredContent` (machine-readable).
Inputs are strict: only the `prompt` field is accepted; extra fields are rejected.

### fix_prompt

Polish and refine a prompt for clarity and flow while preserving intent and structure.

| Parameter | Type   | Required | Notes                                           |
| --------- | ------ | -------- | ----------------------------------------------- |
| `prompt`  | string | Yes      | Trimmed, length-checked; extra fields rejected. |

Returns: `ok`, `fixed`.

### boost_prompt

Refine and enhance a prompt for clarity and effectiveness.

| Parameter | Type   | Required | Notes                                           |
| --------- | ------ | -------- | ----------------------------------------------- |
| `prompt`  | string | Yes      | Trimmed, length-checked; extra fields rejected. |

Returns: `ok`, `boosted`.

### crafting_prompt

Generate a structured, reusable workflow prompt for complex tasks based on a raw request and a few settings.

| Parameter     | Type   | Required | Notes                                        |
| ------------- | ------ | -------- | -------------------------------------------- |
| `request`     | string | Yes      | Trimmed, length-checked; strict input.       |
| `objective`   | string | No       | Acceptance criteria / “definition of done”.  |
| `constraints` | string | No       | Constraints to respect.                      |
| `mode`        | string | No       | `general`, `plan`, `review`, `troubleshoot`. |
| `approach`    | string | No       | `conservative`, `balanced`, `creative`.      |
| `tone`        | string | No       | `direct`, `neutral`, `friendly`.             |
| `verbosity`   | string | No       | `brief`, `normal`, `detailed`.               |

Returns: `ok`, `prompt`, `settings`.

## Response Format

- `content`: array of content blocks. First block is JSON for `structuredContent`, second is a short human message (or `Error: ...`).
- `structuredContent`: machine-parseable results.
- Errors return `structuredContent.ok=false` and an `error` object with `code`, `message`, optional `context` (sanitized, up to 200 chars), `details`, and `recoveryHint`.
- Error responses also include `isError: true`.

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
| `npm run prepublishOnly` | Lint, type-check, and build before publish.           |

## Project Structure

```text
  src/
    index.ts        Entry point
    cli.ts          CLI parsing, logging bootstrap, shutdown handling
    server.ts       MCP server setup (stdio transport)
    tools.ts        Tool implementations
    schemas.ts      Zod input/output schemas
    config.ts       Configuration and constants
    types.ts        Shared types and error codes
    lib/            Shared utilities (LLM, retry, telemetry, prompt utils)

tests/            node:test suites

dist/             Compiled output (generated)

docs/             Static assets
```

## Security

- API keys are supplied only via environment variables.
- Inputs are validated with Zod and additional length checks.
- Error context is included in debug mode (sanitized and truncated to 200 chars).
- Google safety filters are always enabled.

## Contributing

Pull requests are welcome. Please include a short summary, tests run, and note any configuration changes.

## License

MIT License. See `LICENSE` for details.
