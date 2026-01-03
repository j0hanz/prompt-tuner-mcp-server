import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  containsOutputScaffolding,
  normalizePromptText,
  validateTechniqueOutput,
} from '../src/lib/output-validation.js';
import {
  AnalyzePromptOutputSchema,
  OptimizePromptOutputSchema,
  RefinePromptOutputSchema,
  ValidatePromptOutputSchema,
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

describe('output schemas strict mode', () => {
  it('RefinePromptOutputSchema rejects unknown fields', () => {
    const result = RefinePromptOutputSchema.safeParse({
      ok: true,
      refined: 'Hello',
      extraField: 'should fail',
    });
    assert.strictEqual(result.success, false);
  });

  it('AnalyzePromptOutputSchema rejects unknown fields', () => {
    const result = AnalyzePromptOutputSchema.safeParse({
      ok: true,
      suggestions: [],
      unknownKey: 123,
    });
    assert.strictEqual(result.success, false);
  });

  it('OptimizePromptOutputSchema rejects unknown fields', () => {
    const result = OptimizePromptOutputSchema.safeParse({
      ok: true,
      optimized: 'test',
      badField: true,
    });
    assert.strictEqual(result.success, false);
  });

  it('ValidatePromptOutputSchema rejects unknown fields', () => {
    const result = ValidatePromptOutputSchema.safeParse({
      ok: true,
      isValid: true,
      notInSchema: 'nope',
    });
    assert.strictEqual(result.success, false);
  });

  it('accepts valid output without extra fields', () => {
    const refineResult = RefinePromptOutputSchema.safeParse({
      ok: true,
      refined: 'Hello world',
      technique: 'basic',
    });
    assert.strictEqual(refineResult.success, true);

    const validateResult = ValidatePromptOutputSchema.safeParse({
      ok: true,
      isValid: true,
      tokenEstimate: 100,
    });
    assert.strictEqual(validateResult.success, true);
  });
});
