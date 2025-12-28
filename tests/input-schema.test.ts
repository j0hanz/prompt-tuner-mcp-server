import { describe, expect, it } from 'vitest';

import {
  AnalyzePromptInputSchema,
  OptimizePromptInputSchema,
  RefinePromptInputSchema,
  ValidatePromptInputSchema,
} from '../src/schemas/index.js';

describe('input schemas', () => {
  it('rejects unknown fields for refine', () => {
    const result = RefinePromptInputSchema.safeParse({
      prompt: 'Hello',
      extra: 'nope',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields for analyze', () => {
    const result = AnalyzePromptInputSchema.safeParse({
      prompt: 'Hello',
      extra: 'nope',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields for optimize', () => {
    const result = OptimizePromptInputSchema.safeParse({
      prompt: 'Hello',
      extra: 'nope',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields for validate', () => {
    const result = ValidatePromptInputSchema.safeParse({
      prompt: 'Hello',
      extra: 'nope',
    });
    expect(result.success).toBe(false);
  });

  it('applies defaults and trims prompts', () => {
    const refine = RefinePromptInputSchema.parse({ prompt: '  Hi  ' });
    expect(refine.prompt).toBe('Hi');
    expect(refine.technique).toBe('basic');
    expect(refine.targetFormat).toBe('auto');

    const optimize = OptimizePromptInputSchema.parse({ prompt: '  Hi  ' });
    expect(optimize.prompt).toBe('Hi');
    expect(optimize.techniques).toEqual(['basic']);
    expect(optimize.targetFormat).toBe('auto');

    const validate = ValidatePromptInputSchema.parse({ prompt: '  Hi  ' });
    expect(validate.prompt).toBe('Hi');
    expect(validate.targetModel).toBe('generic');
    expect(validate.checkInjection).toBe(true);
  });
});
