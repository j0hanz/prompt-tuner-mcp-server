import { resolveFormat } from '../../lib/prompt-analysis/format.js';
import { RefinePromptInputSchema } from '../../schemas/inputs.js';
import type { RefinePromptInput, ResolvedRefineInputs } from './types.js';

export function resolveInputs(input: RefinePromptInput): ResolvedRefineInputs {
  const parsed = RefinePromptInputSchema.parse(input);
  return {
    validatedPrompt: parsed.prompt,
    validatedTechnique: parsed.technique,
    resolvedFormat: resolveFormat(parsed.targetFormat, parsed.prompt),
  };
}
