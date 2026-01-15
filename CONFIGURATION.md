# PromptTuner MCP Configuration Guide

PromptTuner MCP uses minimal configuration. Set the provider and API key, and you're ready to go.

## Required Configuration

| Variable            | Default  | Description                                           |
| ------------------- | -------- | ----------------------------------------------------- |
| `LLM_PROVIDER`      | `openai` | `openai`, `anthropic`, or `google`.                   |
| `OPENAI_API_KEY`    | -        | Required for all tools when `LLM_PROVIDER=openai`.    |
| `ANTHROPIC_API_KEY` | -        | Required for all tools when `LLM_PROVIDER=anthropic`. |
| `GOOGLE_API_KEY`    | -        | Required for all tools when `LLM_PROVIDER=google`.    |

All tools are LLM-backed and require an API key for the selected provider.

## Optional Configuration

| Variable         | Default | Description                                      |
| ---------------- | ------- | ------------------------------------------------ |
| `LLM_MODEL`      | -       | Override the default model.                      |
| `LLM_TIMEOUT_MS` | `15000` | Override per-request LLM timeout (milliseconds). |
| `DEBUG`          | `false` | Enable debug logging.                            |

## Default Models

| Provider    | Default Model                |
| ----------- | ---------------------------- |
| `openai`    | `gpt-4o`                     |
| `anthropic` | `claude-3-5-sonnet-20241022` |
| `google`    | `gemini-2.0-flash-exp`       |

## CLI Flags

| Flag                        | Description                         |
| --------------------------- | ----------------------------------- |
| `-h, --help`                | Show help text.                     |
| `-v, --version`             | Print version.                      |
| `--debug / --no-debug`      | Enable/disable debug logging.       |
| `--llm-provider <provider>` | `openai`, `anthropic`, or `google`. |
| `--llm-model <name>`        | Override the default model.         |

CLI flags override environment variables.

## Example Configurations

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

### With Custom Model

```json
{
  "mcpServers": {
    "prompttuner": {
      "command": "npx",
      "args": ["-y", "@j0hanz/prompt-tuner-mcp-server@latest"],
      "env": {
        "LLM_PROVIDER": "openai",
        "OPENAI_API_KEY": "${input:openai-api-key}",
        "LLM_MODEL": "gpt-4o-mini"
      }
    }
  }
}
```

### Google Gemini

```json
{
  "mcpServers": {
    "prompttuner": {
      "command": "npx",
      "args": ["-y", "@j0hanz/prompt-tuner-mcp-server@latest"],
      "env": {
        "LLM_PROVIDER": "google",
        "GOOGLE_API_KEY": "${input:google-api-key}"
      }
    }
  }
}
```

## Default Settings

The following are optimized defaults:

| Setting             | Value   | Purpose                                     |
| ------------------- | ------- | ------------------------------------------- |
| Max prompt length   | 10,000  | Input character limit                       |
| Retry attempts      | 3       | Retries on transient failures               |
| Retry base delay    | 1s      | Exponential backoff base                    |
| Retry max delay     | 10s     | Backoff cap                                 |
| Retry total timeout | 180s    | Total retry window                          |
| Max output tokens   | 10,000  | Output token cap (scales with input length) |
| Google safety       | Enabled | Content filtering                           |

## Troubleshooting

### Prompt rejected

Shorten the prompt or remove excessive whitespace (limit: 10,000 chars).

### Timeout errors

Try a faster model like `gpt-4o-mini` or `gemini-2.0-flash-exp`.

### Rate limit errors

Reduce request frequency. The server automatically retries with backoff.

### Debug mode

Set `DEBUG=true` to see detailed logs including LLM request telemetry.

## Best Practices

1. Only configure the API key for your chosen provider.
2. Use input variables for secrets: `"OPENAI_API_KEY": "${input:openai-api-key}"`.
3. Start with defaults—they work well for most use cases.
4. Use `gpt-4o-mini` or `gemini-2.0-flash-exp` for faster, cheaper responses.
