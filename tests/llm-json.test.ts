import { describe, expect, it } from 'vitest';

import { ErrorCode } from '../src/lib/errors.js';
import { parseJsonFromLlmResponse } from '../src/lib/llm-json.js';

describe('parseJsonFromLlmResponse', () => {
  it('parses raw JSON payloads', () => {
    const result = parseJsonFromLlmResponse(
      '{"ok":true}',
      (value) => {
        if (typeof value !== 'object' || value === null) {
          throw new Error('invalid');
        }
        return value as { ok: boolean };
      },
      { errorCode: ErrorCode.E_INVALID_INPUT }
    );

    expect(result.ok).toBe(true);
  });

  it('parses JSON wrapped in code block markers', () => {
    const payload = '```json\n{"ok":true}\n```';
    const result = parseJsonFromLlmResponse(
      payload,
      (value) => {
        if (typeof value !== 'object' || value === null) {
          throw new Error('invalid');
        }
        return value as { ok: boolean };
      },
      { errorCode: ErrorCode.E_INVALID_INPUT }
    );

    expect(result.ok).toBe(true);
  });

  it('parses JSON embedded in surrounding text', () => {
    const payload = 'Here is the result: {"ok":true,"count":2} Thanks!';
    const result = parseJsonFromLlmResponse(
      payload,
      (value) => {
        if (typeof value !== 'object' || value === null) {
          throw new Error('invalid');
        }
        return value as { ok: boolean; count: number };
      },
      { errorCode: ErrorCode.E_INVALID_INPUT }
    );

    expect(result.ok).toBe(true);
    expect(result.count).toBe(2);
  });

  it('rejects payloads that exceed maxInputLength', () => {
    const payload = 'abcdef';
    expect(() =>
      parseJsonFromLlmResponse(payload, (value) => value, {
        errorCode: ErrorCode.E_INVALID_INPUT,
        maxInputLength: 5,
      })
    ).toThrow(/LLM response too large/);
  });
});
