import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  containsOutputScaffolding,
  normalizePromptText,
  validateTechniqueOutput,
} from '../src/lib/output-validation.js';

describe('output validation', () => {
  it('normalizes wrapped code fences', () => {
    const result = normalizePromptText('```text\nHello\n```');
    assert.strictEqual(result.normalized, 'Hello');
    assert.strictEqual(result.changed, true);
  });

  it('normalizes prompt labels with fenced content', () => {
    const input = 'Refined Prompt:\n```text\nHello\n```';
    const result = normalizePromptText(input);
    assert.strictEqual(result.normalized, 'Hello');
  });

  it('detects output scaffolding', () => {
    assert.strictEqual(
      containsOutputScaffolding('# Prompt Refinement\n'),
      true
    );
  });

  it('validates structured output for gpt format', () => {
    const result = validateTechniqueOutput(
      '## Title\n- Item',
      'structured',
      'gpt'
    );
    assert.strictEqual(result.ok, true);
  });

  it('rejects roleBased output without a role statement', () => {
    const result = validateTechniqueOutput(
      'Please answer succinctly.',
      'roleBased',
      'gpt'
    );
    assert.strictEqual(result.ok, false);
  });
});
