import { describe, expect, it } from 'vitest';

import {
  containsOutputScaffolding,
  normalizePromptText,
  validateTechniqueOutput,
} from '../src/lib/output-validation.js';

describe('output validation', () => {
  it('normalizes wrapped code fences', () => {
    const result = normalizePromptText('```text\nHello\n```');
    expect(result.normalized).toBe('Hello');
    expect(result.changed).toBe(true);
  });

  it('normalizes prompt labels with fenced content', () => {
    const input = 'Refined Prompt:\n```text\nHello\n```';
    const result = normalizePromptText(input);
    expect(result.normalized).toBe('Hello');
  });

  it('detects output scaffolding', () => {
    expect(containsOutputScaffolding('# Prompt Refinement\n')).toBe(true);
  });

  it('validates structured output for gpt format', () => {
    const result = validateTechniqueOutput(
      '## Title\n- Item',
      'structured',
      'gpt'
    );
    expect(result.ok).toBe(true);
  });

  it('rejects roleBased output without a role statement', () => {
    const result = validateTechniqueOutput(
      'Please answer succinctly.',
      'roleBased',
      'gpt'
    );
    expect(result.ok).toBe(false);
  });
});
