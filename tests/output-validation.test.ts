import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  containsOutputScaffolding,
  normalizePromptText,
} from '../src/lib/output-validation.js';
import {
  BoostPromptOutputSchema,
  FixPromptOutputSchema,
} from '../src/schemas/outputs.js';

describe('output validation', () => {
  it('normalizes wrapped code fences', () => {
    const result = normalizePromptText('```text\nHello\n```');
    assert.strictEqual(result, 'Hello');
  });

  it('normalizes prompt labels with fenced content', () => {
    const input = 'Refined Prompt:\n```text\nHello\n```';
    const result = normalizePromptText(input);
    assert.strictEqual(result, 'Hello');
  });

  it('detects output scaffolding', () => {
    assert.strictEqual(
      containsOutputScaffolding('# Prompt Refinement\n'),
      true
    );
  });
});

describe('output schemas strict mode', () => {
  it('FixPromptOutputSchema rejects unknown fields', () => {
    const result = FixPromptOutputSchema.safeParse({
      ok: true,
      fixed: 'Hello',
      extraField: 'should fail',
    });
    assert.strictEqual(result.success, false);
  });

  it('BoostPromptOutputSchema rejects unknown fields', () => {
    const result = BoostPromptOutputSchema.safeParse({
      ok: true,
      unknownKey: 123,
    });
    assert.strictEqual(result.success, false);
  });

  it('accepts valid output without extra fields', () => {
    const fixResult = FixPromptOutputSchema.safeParse({
      ok: true,
      fixed: 'Hello world',
    });
    assert.strictEqual(fixResult.success, true);

    const boostResult = BoostPromptOutputSchema.safeParse({
      ok: true,
      boosted: 'Hello world',
    });
    assert.strictEqual(boostResult.success, true);
  });
});
