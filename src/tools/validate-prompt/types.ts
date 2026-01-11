import type { ValidationIssue } from '../../config/types.js';

export type ValidationModel = 'claude' | 'gpt' | 'gemini' | 'generic';

export interface ValidatePromptInput {
  prompt: string;
  targetModel?: ValidationModel;
  checkInjection?: boolean;
}

export interface IssueGroup {
  label: string;
  type: ValidationIssue['type'];
}
