import { describe, expect, it } from 'vitest';

import { ErrorCode, McpError } from '../src/lib/errors.js';
import { withRetry } from '../src/lib/retry.js';

describe('withRetry', () => {
  it('retries on retryable errors and succeeds', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          const error = new Error('temporary') as Error & { code?: string };
          error.code = 'ECONNRESET';
          throw error;
        }
        return 'ok';
      },
      { maxRetries: 5, baseDelayMs: 0, maxDelayMs: 0, totalTimeoutMs: 5000 }
    );

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('does not retry non-retryable McpError codes', async () => {
    let attempts = 0;
    const error = new McpError(ErrorCode.E_INVALID_INPUT, 'Invalid input');

    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw error;
        },
        { maxRetries: 3, baseDelayMs: 0, maxDelayMs: 0, totalTimeoutMs: 5000 }
      )
    ).rejects.toMatchObject({ code: ErrorCode.E_INVALID_INPUT });

    expect(attempts).toBe(1);
  });
});
