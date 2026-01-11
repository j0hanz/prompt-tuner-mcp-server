import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BoostPromptInputSchema,
  FixPromptInputSchema,
} from '../src/schemas/inputs.js';

describe('input schemas', () => {
  it('rejects unknown fields for fix', () => {
    const result = FixPromptInputSchema.safeParse({
      prompt: 'Hello',
      extra: 'nope',
    });
    assert.strictEqual(result.success, false);
  });

  it('rejects unknown fields for boost', () => {
    const result = BoostPromptInputSchema.safeParse({
      prompt: 'Hello',
      extra: 'nope',
    });
    assert.strictEqual(result.success, false);
  });

  it('trims prompts', () => {
    const fix = FixPromptInputSchema.parse({ prompt: '  Hi  ' });
    assert.strictEqual(fix.prompt, 'Hi');

    const boost = BoostPromptInputSchema.parse({ prompt: '  Hi  ' });
    assert.strictEqual(boost.prompt, 'Hi');
  });
});
