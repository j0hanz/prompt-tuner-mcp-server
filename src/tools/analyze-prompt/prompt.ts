import { wrapPromptData } from '../../lib/prompt-policy.js';
import { ANALYSIS_SYSTEM_PROMPT } from './constants.js';

export function buildAnalysisPrompt(prompt: string): string {
  return `${ANALYSIS_SYSTEM_PROMPT}\n\n<prompt_to_analyze>\n${wrapPromptData(
    prompt
  )}\n</prompt_to_analyze>`;
}
