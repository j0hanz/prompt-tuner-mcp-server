import type {
  OptimizationTechnique,
  TargetFormat,
} from '../../config/types.js';
import { wrapPromptData } from '../../lib/prompt-policy.js';
import { OPTIMIZE_SYSTEM_PROMPT } from './constants.js';

export function buildOptimizePrompt(
  prompt: string,
  resolvedFormat: TargetFormat,
  techniques: readonly OptimizationTechnique[],
  extraRules?: string
): string {
  return `${OPTIMIZE_SYSTEM_PROMPT}\n\nTarget Format: ${resolvedFormat}\nTechniques to apply: ${techniques.join(
    ', '
  )}\n${extraRules ?? ''}\n\n<original_prompt>\n${wrapPromptData(
    prompt
  )}\n</original_prompt>`;
}
