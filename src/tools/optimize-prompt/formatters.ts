import {
  OPTIMIZATION_TECHNIQUES,
  type OptimizationTechnique,
} from '../../config/types.js';
import { asBulletList } from '../../lib/tool-formatters.js';

const VALID_TECHNIQUES = new Set(OPTIMIZATION_TECHNIQUES);
const TECHNIQUE_DISPLAY_ORDER = [
  ...OPTIMIZATION_TECHNIQUES,
  'general',
] as const;
const TECHNIQUE_TAG_PATTERN = /^([a-zA-Z]+)\s*:\s*(.+)$/;

function normalizeTechniqueName(value: string): OptimizationTechnique | null {
  const normalized = value.toLowerCase();
  return VALID_TECHNIQUES.has(normalized as OptimizationTechnique)
    ? (normalized as OptimizationTechnique)
    : null;
}

function splitTechniqueTag(improvement: string): {
  bucket: string;
  detail: string;
} {
  const trimmed = improvement.trim();
  const match = TECHNIQUE_TAG_PATTERN.exec(trimmed);
  if (!match) {
    return { bucket: 'general', detail: trimmed };
  }

  const technique = match[1] ? normalizeTechniqueName(match[1]) : null;
  const detail = match[2]?.trim();
  if (!detail || !technique) {
    return { bucket: 'general', detail: trimmed };
  }

  return { bucket: technique, detail };
}

function groupImprovementsByTechnique(
  improvements: string[]
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const improvement of improvements) {
    const { bucket, detail } = splitTechniqueTag(improvement);
    const existing = groups.get(bucket);
    if (existing) {
      existing.push(detail);
    } else {
      groups.set(bucket, [detail]);
    }
  }
  return groups;
}

export function formatImprovements(improvements: string[]): string[] {
  const groups = groupImprovementsByTechnique(improvements);
  if (groups.size === 1 && groups.has('general')) {
    return asBulletList(improvements.map((item) => item.trim()));
  }

  const lines: string[] = [];
  for (const technique of TECHNIQUE_DISPLAY_ORDER) {
    const items = groups.get(technique);
    if (!items?.length) continue;
    lines.push(`Technique: ${technique}`);
    lines.push(...asBulletList(items));
  }
  return lines;
}
