import { wrapPromptData } from '../../lib/prompt-policy.js';
import { VALIDATION_SYSTEM_PROMPT } from './constants.js';
import type { ValidationModel } from './types.js';

export function buildValidationPrompt(
  validatedPrompt: string,
  targetModel: ValidationModel,
  checkInjection: boolean
): string {
  return `${VALIDATION_SYSTEM_PROMPT}\n\nTarget Model: ${targetModel}\nCheck Injection: ${String(
    checkInjection
  )}\n\n<prompt_to_validate>\n${wrapPromptData(
    validatedPrompt
  )}\n</prompt_to_validate>`;
}
