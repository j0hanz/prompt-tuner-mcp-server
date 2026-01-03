import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AnalyzePromptInputSchema,
  OptimizePromptInputSchema,
  RefinePromptInputSchema,
  ValidatePromptInputSchema,
} from '../src/schemas/inputs.js';

describe('input schemas', () => {
  it('rejects unknown fields for refine', () => {
    const result = RefinePromptInputSchema.safeParse({
      prompt: 'Hello',
      extra: 'nope',
    });
    assert.strictEqual(result.success, false);
  });

  it('rejects unknown fields for analyze', () => {
    const result = AnalyzePromptInputSchema.safeParse({
      prompt: 'Hello',
      extra: 'nope',
    });
    assert.strictEqual(result.success, false);
  });

  it('rejects unknown fields for optimize', () => {
    const result = OptimizePromptInputSchema.safeParse({
      prompt: 'Hello',
      extra: 'nope',
    });
    assert.strictEqual(result.success, false);
  });

  it('rejects unknown fields for validate', () => {
    const result = ValidatePromptInputSchema.safeParse({
      prompt: 'Hello',
      extra: 'nope',
    });
    assert.strictEqual(result.success, false);
  });

  it('applies defaults and trims prompts', () => {
    const refine = RefinePromptInputSchema.parse({ prompt: '  Hi  ' });
    assert.strictEqual(refine.prompt, 'Hi');
    assert.strictEqual(refine.technique, 'basic');
    assert.strictEqual(refine.targetFormat, 'auto');

    const optimize = OptimizePromptInputSchema.parse({ prompt: '  Hi  ' });
    assert.strictEqual(optimize.prompt, 'Hi');
    assert.deepStrictEqual(optimize.techniques, ['basic']);
    assert.strictEqual(optimize.targetFormat, 'auto');

    const validate = ValidatePromptInputSchema.parse({ prompt: '  Hi  ' });
    assert.strictEqual(validate.prompt, 'Hi');
    assert.strictEqual(validate.targetModel, 'generic');
    assert.strictEqual(validate.checkInjection, true);
  });
});
