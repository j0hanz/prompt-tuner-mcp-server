import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

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

    assert.strictEqual(result.ok, true);
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

    assert.strictEqual(result.ok, true);
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

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.count, 2);
  });

  it('parses JSON with braces inside strings', () => {
    const payload =
      'Payload: {"ok":true,"text":"{not a brace}","items":[{"a":1}]} done';
    const result = parseJsonFromLlmResponse(
      payload,
      (value) => {
        if (typeof value !== 'object' || value === null) {
          throw new Error('invalid');
        }
        return value as { ok: boolean; text: string; items: { a: number }[] };
      },
      { errorCode: ErrorCode.E_INVALID_INPUT }
    );

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.text, '{not a brace}');
    assert.strictEqual(result.items[0]?.a, 1);
  });

  it('rejects payloads that exceed maxInputLength', () => {
    const payload = 'abcdef';
    assert.throws(
      () =>
        parseJsonFromLlmResponse(payload, (value) => value, {
          errorCode: ErrorCode.E_INVALID_INPUT,
          maxInputLength: 5,
        }),
      /LLM response too large/
    );
  });
});
