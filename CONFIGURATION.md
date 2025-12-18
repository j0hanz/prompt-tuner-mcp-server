# PromptTuner MCP Configuration Guide

## Environment Variables

All configuration is done through environment variables. Set them in your MCP client configuration (e.g., `mcp.json` for VS Code) or in a `.env` file.

### Required Configuration

| Variable            | Description             | Default           | Example                                                        |
| ------------------- | ----------------------- | ----------------- | -------------------------------------------------------------- |
| `LLM_PROVIDER`      | LLM provider to use     | `openai`          | `openai`, `anthropic`, `google`                                |
| `OPENAI_API_KEY`    | OpenAI API key          | -                 | `sk-...`                                                       |
| `ANTHROPIC_API_KEY` | Anthropic API key       | -                 | `sk-ant-...`                                                   |
| `GOOGLE_API_KEY`    | Google Gemini API key   | -                 | `AIzaSy...`                                                    |
| `LLM_MODEL`         | Model to use (optional) | Provider-specific | `gpt-4o`, `claude-3-5-sonnet-20241022`, `gemini-2.0-flash-exp` |

**Note**: Only provide the API key for your chosen provider.

### Performance & Limits (Optional)

| Variable            | Description               | Default         | Recommended Range |
| ------------------- | ------------------------- | --------------- | ----------------- |
| `LLM_TIMEOUT_MS`    | LLM request timeout (ms)  | `60000` (1 min) | 30000-120000      |
| `LLM_MAX_TOKENS`    | Max tokens per response   | `2000`          | 1000-4000         |
| `MAX_PROMPT_LENGTH` | Max prompt length (chars) | `10000`         | 5000-50000        |
| `CACHE_MAX_SIZE`    | Max cached refinements    | `1000`          | 500-5000          |

### Retry Configuration (Optional)

| Variable                 | Description                    | Default          | Recommended Range |
| ------------------------ | ------------------------------ | ---------------- | ----------------- |
| `RETRY_MAX_ATTEMPTS`     | Max retry attempts             | `3`              | 1-5               |
| `RETRY_BASE_DELAY_MS`    | Initial retry delay (ms)       | `1000`           | 500-2000          |
| `RETRY_MAX_DELAY_MS`     | Max retry delay (ms)           | `10000`          | 5000-30000        |
| `RETRY_TOTAL_TIMEOUT_MS` | Total timeout for retries (ms) | `180000` (3 min) | 60000-300000      |

### Logging & Debugging (Optional)

| Variable                | Description               | Default | Options         |
| ----------------------- | ------------------------- | ------- | --------------- |
| `LOG_FORMAT`            | Log output format         | `text`  | `text`, `json`  |
| `DEBUG`                 | Enable debug logging      | `false` | `true`, `false` |
| `INCLUDE_ERROR_CONTEXT` | Include context in errors | `false` | `true`, `false` |

**Security Note**: When `INCLUDE_ERROR_CONTEXT=true`, error responses may include up to 500 characters of the prompt that caused the error. Only enable this in development.

### Provider-Specific (Optional)

| Variable                 | Description                   | Default | Options         |
| ------------------------ | ----------------------------- | ------- | --------------- |
| `GOOGLE_SAFETY_DISABLED` | Disable Gemini safety filters | `false` | `true`, `false` |

## Example Configurations

### Minimal (Production)

```json
{
  "prompttuner": {
    "command": "node",
    "args": ["/path/to/prompttuner-mcp/dist/index.js"],
    "env": {
      "LLM_PROVIDER": "openai",
      "OPENAI_API_KEY": "${input:openai-api-key}"
    }
  }
}
```

### Performance Tuned

```json
{
  "prompttuner": {
    "command": "node",
    "args": ["/path/to/prompttuner-mcp/dist/index.js"],
    "env": {
      "LLM_PROVIDER": "anthropic",
      "ANTHROPIC_API_KEY": "${input:anthropic-api-key}",
      "LLM_MODEL": "claude-3-5-sonnet-20241022",
      "LLM_TIMEOUT_MS": "90000",
      "LLM_MAX_TOKENS": "3000",
      "CACHE_MAX_SIZE": "2000",
      "RETRY_MAX_ATTEMPTS": "5"
    }
  }
}
```

### Development/Debug

```json
{
  "prompttuner": {
    "command": "node",
    "args": ["/path/to/prompttuner-mcp/dist/index.js"],
    "env": {
      "LLM_PROVIDER": "google",
      "GOOGLE_API_KEY": "${input:google-api-key}",
      "LLM_MODEL": "gemini-2.0-flash-exp",
      "LOG_FORMAT": "json",
      "DEBUG": "true",
      "INCLUDE_ERROR_CONTEXT": "true"
    }
  }
}
```

### High Volume / Low Latency

```json
{
  "prompttuner": {
    "command": "node",
    "args": ["/path/to/prompttuner-mcp/dist/index.js"],
    "env": {
      "LLM_PROVIDER": "openai",
      "OPENAI_API_KEY": "${input:openai-api-key}",
      "LLM_MODEL": "gpt-4o-mini",
      "LLM_TIMEOUT_MS": "30000",
      "LLM_MAX_TOKENS": "1500",
      "CACHE_MAX_SIZE": "5000",
      "RETRY_MAX_ATTEMPTS": "2",
      "RETRY_BASE_DELAY_MS": "500"
    }
  }
}
```

## What's NOT Configurable (and Why)

The following are intentionally hardcoded for stability and optimal performance:

### Scoring Algorithm

- **Scoring dimension weights** (clarity: 0.25, specificity: 0.25, etc.)
- **Reason**: Carefully tuned based on prompt engineering research

### Analysis Constants

- **Pattern matching regex** for detecting prompt characteristics
- **Reason**: Complex regex patterns that work across all use cases

### LLM Behavior

- **Temperature** (0.7 for refinement tasks)
- **Reason**: Optimal balance between creativity and consistency for prompt refinement

### Internal Limits

- **Analysis max tokens** (1500)
- **Analysis timeout** (60000ms)
- **Max LLM response length** (500,000 chars)
- **Error context truncation** (500 chars)
- **Reason**: Safety constraints to prevent resource exhaustion

## Migration from Old Configuration

If you have an old `.env` file with these variables, **remove them** (they are not used):

- ❌ `PORT` / `HOST` - HTTP mode not fully implemented in stdio version
- ❌ `API_KEY` - No API authentication in current version
- ❌ `CORS_ORIGIN` - No HTTP CORS in stdio version
- ❌ `LOG_LEVEL` - Use `DEBUG=true/false` instead
- ❌ `RATE_LIMIT` / `RATE_WINDOW_MS` - No rate limiting in current version
- ❌ `REDIS_URL` / `CACHE_TTL` - In-memory cache only
- ❌ `CIRCUIT_BREAKER_*` - Not implemented
- ❌ `NODE_ENV` - Not used for configuration
- ❌ `SESSION_TIMEOUT_MS` - No session management

## Troubleshooting

### High Memory Usage

- Reduce `CACHE_MAX_SIZE` (e.g., `500`)
- Reduce `MAX_PROMPT_LENGTH` (e.g., `5000`)

### Timeout Errors

- Increase `LLM_TIMEOUT_MS` (e.g., `90000`)
- Increase `RETRY_TOTAL_TIMEOUT_MS` (e.g., `300000`)
- Reduce `LLM_MAX_TOKENS` (e.g., `1500`)

### Rate Limit Errors

- Increase `RETRY_BASE_DELAY_MS` (e.g., `2000`)
- Increase `RETRY_MAX_ATTEMPTS` (e.g., `5`)

### Slow Performance

- Increase `CACHE_MAX_SIZE` (e.g., `2000`)
- Use faster model (e.g., `gpt-4o-mini` or `gemini-2.0-flash-exp`)
- Reduce `LLM_MAX_TOKENS` (e.g., `1500`)

### Debug Logging Not Showing

- Set `DEBUG=true`
- Check logs are going to stderr (where MCP logs are captured)

## Best Practices

1. **Always set only one API key** - Only configure the key for your chosen provider
2. **Use input variables for secrets** - In mcp.json: `"OPENAI_API_KEY": "${input:openai-api-key}"`
3. **Start with defaults** - Only override what you need
4. **Enable debug logging temporarily** - `DEBUG=true` for troubleshooting only
5. **Monitor cache hit rate** - Check logs for "Cache hit for refinement" messages
6. **Test timeout settings** - Start conservative, increase if seeing timeout errors
7. **Use JSON logging in production** - `LOG_FORMAT=json` for easier parsing
