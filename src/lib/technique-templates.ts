import type {
  OptimizationTechnique,
  TargetFormat,
  TechniqueTemplate,
} from '../config/types.js';
import { wrapPromptData } from './prompt-policy.js';
import { getFormatInstructions } from './technique-templates/format-instructions.js';
import { ADVANCED_TECHNIQUE_TEMPLATES } from './technique-templates/templates-advanced.js';
import { BASIC_TECHNIQUE_TEMPLATES } from './technique-templates/templates-basic.js';

function getTechniqueTemplate(
  technique: OptimizationTechnique
): TechniqueTemplate {
  return TECHNIQUE_TEMPLATES[technique];
}

const TECHNIQUE_TEMPLATES: Record<OptimizationTechnique, TechniqueTemplate> = {
  ...BASIC_TECHNIQUE_TEMPLATES,
  ...ADVANCED_TECHNIQUE_TEMPLATES,
};

export function buildRefinementPrompt(
  originalPrompt: string,
  technique: OptimizationTechnique,
  targetFormat: TargetFormat
): string {
  const template = getTechniqueTemplate(technique);
  const formatInstructions = getFormatInstructions(targetFormat);

  return `${template.systemPrompt}
${formatInstructions}

<original_prompt>
${wrapPromptData(originalPrompt)}
</original_prompt>`;
}
