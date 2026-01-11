# PromptTuner MCP Configuration Guide

PromptTuner MCP is configured entirely via environment variables. Set them in your MCP client configuration (for example `mcp.json`, `claude_desktop_config.json`) or a `.env` file. Node.js >= 22.0.0 is required (see `package.json` engines).

## Required configuration

You must pick a provider and supply its API key.

| Variable            | Default  | Description                             |
| ------------------- | -------- | --------------------------------------- |
| `LLM_PROVIDER`      | `openai` | `openai`, `anthropic`, or `google`.     |
| `OPENAI_API_KEY`    | -        | Required when `LLM_PROVIDER=openai`.    |
| `ANTHROPIC_API_KEY` | -        | Required when `LLM_PROVIDER=anthropic`. |
| `GOOGLE_API_KEY`    | -        | Required when `LLM_PROVIDER=google`.    |

PromptTuner checks that the correct API key environment variable is set at startup. The provider will reject invalid keys at request time.

## Provider defaults

| Provider    | Default model                | API key env         |
| ----------- | ---------------------------- | ------------------- |
| `openai`    | `gpt-4o`                     | `OPENAI_API_KEY`    |
| `anthropic` | `claude-3-5-sonnet-20241022` | `ANTHROPIC_API_KEY` |
| `google`    | `gemini-2.0-flash-exp`       | `GOOGLE_API_KEY`    |

Set `LLM_MODEL` to override the default model for the chosen provider.

## CLI overrides

CLI flags override environment variables. Flags only cover a subset of settings; retry options and `GOOGLE_SAFETY_DISABLED` are env-only.

| Flag                                                   | Env var                 | Description                                 |
| ------------------------------------------------------ | ----------------------- | ------------------------------------------- |
| `--debug / --no-debug`                                 | `DEBUG`                 | Enable/disable debug logging.               |
| `--include-error-context / --no-include-error-context` | `INCLUDE_ERROR_CONTEXT` | Include sanitized prompt snippet in errors. |
| `--llm-provider <provider>`                            | `LLM_PROVIDER`          | `openai`, `anthropic`, or `google`.         |
| `--llm-model <name>`                                   | `LLM_MODEL`             | Override the default model.                 |
| `--llm-timeout-ms <number>`                            | `LLM_TIMEOUT_MS`        | Override request timeout (ms).              |
| `--llm-max-tokens <number>`                            | `LLM_MAX_TOKENS`        | Override output token cap.                  |
| `--max-prompt-length <number>`                         | `MAX_PROMPT_LENGTH`     | Override max prompt length (chars).         |
| `--help`                                               | -                       | Show help text.                             |
| `--version`                                            | -                       | Print the current version.                  |

## Limits and timeouts (optional)

| Variable            | Default | Description                          |
| ------------------- | ------- | ------------------------------------ |
| `MAX_PROMPT_LENGTH` | `10000` | Max trimmed prompt length (chars).   |
| `LLM_MAX_TOKENS`    | `8000`  | Upper bound for model output tokens. |
| `LLM_TIMEOUT_MS`    | `60000` | Request timeout (ms).                |

All numeric values are parsed as integers. Invalid values or values below the minimum thresholds will fail startup validation.

Minimums: `MAX_PROMPT_LENGTH` >= 1, `LLM_MAX_TOKENS` >= 1, `LLM_TIMEOUT_MS` >= 1000.

### Prompt length enforcement

- Input is trimmed before validation.
- Raw input length is capped at `MAX_PROMPT_LENGTH * 2` before trimming.
- If trimmed input exceeds `MAX_PROMPT_LENGTH`, it is rejected.

### Tool token caps

Tool max tokens are derived from `LLM_MAX_TOKENS`:

| Tool           | Max tokens                  |
| -------------- | --------------------------- |
| `fix_prompt`   | `min(LLM_MAX_TOKENS, 800)`  |
| `boost_prompt` | `min(LLM_MAX_TOKENS, 1200)` |

## Retry behavior (optional)

| Variable                 | Default  | Description                                    |
| ------------------------ | -------- | ---------------------------------------------- |
| `RETRY_MAX_ATTEMPTS`     | `3`      | Max retry attempts (total attempts = max + 1). |
| `RETRY_BASE_DELAY_MS`    | `1000`   | Base delay for exponential backoff.            |
| `RETRY_MAX_DELAY_MS`     | `10000`  | Max delay between retries.                     |
| `RETRY_TOTAL_TIMEOUT_MS` | `180000` | Total time allowed across retries.             |

Retries use exponential backoff with jitter and stop when the total timeout is exceeded.

Minimums: `RETRY_MAX_ATTEMPTS` >= 0, `RETRY_BASE_DELAY_MS` >= 100, `RETRY_MAX_DELAY_MS` >= 1000, `RETRY_TOTAL_TIMEOUT_MS` >= 10000.

## Logging and error context (optional)

| Variable                | Default | Description                                                                              |
| ----------------------- | ------- | ---------------------------------------------------------------------------------------- |
| `DEBUG`                 | `false` | Enables debug logging (set to the string `true` or `false`). Logs are written to stderr. |
| `INCLUDE_ERROR_CONTEXT` | `false` | Adds a sanitized prompt snippet (up to 200 chars) to errors.                             |

When `DEBUG=true`, the server also logs diagnostics-channel telemetry for LLM requests and event-loop health.

## Provider-specific settings

| Variable                 | Default | Description                                |
| ------------------------ | ------- | ------------------------------------------ |
| `GOOGLE_SAFETY_DISABLED` | `false` | When true, disables Gemini safety filters. |

## Example configurations

### Minimal (npx)

```json
{
  "mcpServers": {
    "prompttuner": {
      "command": "npx",
      "args": ["-y", "@j0hanz/prompt-tuner-mcp-server@latest"],
      "env": {
        "LLM_PROVIDER": "openai",
        "OPENAI_API_KEY": "${input:openai-api-key}"
      }
    }
  }
}
```

### From source (dist build)

```json
{
  "mcpServers": {
    "prompttuner": {
      "command": "node",
      "args": ["/path/to/prompttuner-mcp/dist/index.js"],
      "env": {
        "LLM_PROVIDER": "anthropic",
        "ANTHROPIC_API_KEY": "${input:anthropic-api-key}"
      }
    }
  }
}
```

### Performance tuned

```json
{
  "mcpServers": {
    "prompttuner": {
      "command": "node",
      "args": ["/path/to/prompttuner-mcp/dist/index.js"],
      "env": {
        "LLM_PROVIDER": "anthropic",
        "ANTHROPIC_API_KEY": "${input:anthropic-api-key}",
        "LLM_MODEL": "claude-3-5-sonnet-20241022",
        "LLM_TIMEOUT_MS": "90000",
        "LLM_MAX_TOKENS": "8000",
        "RETRY_MAX_ATTEMPTS": "5"
      }
    }
  }
}
```

### High volume / low latency

```json
{
  "mcpServers": {
    "prompttuner": {
      "command": "node",
      "args": ["/path/to/prompttuner-mcp/dist/index.js"],
      "env": {
        "LLM_PROVIDER": "openai",
        "OPENAI_API_KEY": "${input:openai-api-key}",
        "LLM_MODEL": "gpt-4o-mini",
        "LLM_TIMEOUT_MS": "30000",
        "LLM_MAX_TOKENS": "1500",
        "RETRY_MAX_ATTEMPTS": "2",
        "RETRY_BASE_DELAY_MS": "500"
      }
    }
  }
}
```

## What is not configurable

The following behaviors are hardcoded for stability:

- Stdio transport only (no HTTP listener).
- Tool schemas are strict: only `prompt` is accepted; extra fields are rejected.
- Raw input hard cap is `MAX_PROMPT_LENGTH * 2` before trimming.
- Prompt input is JSON-encoded between sentinel markers and sanitized (markers, bidi control chars, null bytes).
- Tool token caps are fixed at 800 (fix) and 1200 (boost), bounded by `LLM_MAX_TOKENS`.
- Output normalization always strips code fences and leading prompt labels.
- Error context sanitization/truncation is fixed at 200 chars when enabled.

## Migration notes (older configs)

If you have an old `.env` file, remove unused settings:

- `PORT`, `HOST`, `CORS_ORIGIN` (stdio transport only; no HTTP listener).
- `API_KEY` (no server-level auth).
- `LOG_LEVEL` (use `DEBUG=true` or false).
- `RATE_LIMIT`, `RATE_WINDOW_MS` (no server-side rate limiting).
- `REDIS_URL`, `CACHE_TTL` (no caching).
- `CIRCUIT_BREAKER_*` (not implemented).
- `NODE_ENV` (not used for configuration).
- `SESSION_TIMEOUT_MS` (no session management).

## Troubleshooting

### Prompt rejected

- Shorten the prompt, remove excessive whitespace, or increase `MAX_PROMPT_LENGTH`.

### Timeout errors

- Increase `LLM_TIMEOUT_MS` or `RETRY_TOTAL_TIMEOUT_MS`.
- Reduce `LLM_MAX_TOKENS`.

### Rate limit errors

- Increase `RETRY_BASE_DELAY_MS` or `RETRY_MAX_ATTEMPTS`.
- Reduce request frequency.

### Slow performance

- Use a faster model (for example `gpt-4o-mini` or `gemini-2.0-flash-exp`).
- Reduce `LLM_MAX_TOKENS`.

## Best practices

1. Configure only the API key for your chosen provider.
2. Use input variables for secrets (for example `"OPENAI_API_KEY": "${input:openai-api-key}"`).
3. Start with defaults and tune only when needed.
4. Enable `DEBUG=true` temporarily for troubleshooting.
5. Logs are JSON via pino; plan parsing/collection accordingly.
