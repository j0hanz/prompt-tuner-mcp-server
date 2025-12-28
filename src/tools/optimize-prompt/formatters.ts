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

function resolveTechnique(value?: string): OptimizationTechnique | null {
  if (!value) return null;
  return normalizeTechniqueName(value);
}

function resolveDetail(value?: string): string | null {
  const detail = value?.trim();
  if (!detail) return null;
  return detail;
}

function extractTechniqueMatch(trimmed: string): {
  technique: OptimizationTechnique | null;
  detail: string;
} | null {
  const match = TECHNIQUE_TAG_PATTERN.exec(trimmed);
  if (!match) return null;

  const technique = resolveTechnique(match[1]);
  const detail = resolveDetail(match[2]);
  if (!detail) return null;

  return { technique, detail };
}

function splitTechniqueTag(improvement: string): {
  bucket: string;
  detail: string;
} {
  const trimmed = improvement.trim();
  const match = extractTechniqueMatch(trimmed);
  if (!match?.technique) {
    return { bucket: 'general', detail: trimmed };
  }
  return { bucket: match.technique, detail: match.detail };
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

function isGeneralOnly(groups: Map<string, string[]>): boolean {
  return groups.size === 1 && groups.has('general');
}

function pushTechniqueGroup(
  lines: string[],
  technique: string,
  items: string[]
): void {
  lines.push(`Technique: ${technique}`);
  lines.push(...asBulletList(items));
}

export function formatImprovements(improvements: string[]): string[] {
  const groups = groupImprovementsByTechnique(improvements);
  if (isGeneralOnly(groups)) {
    return asBulletList(improvements.map((item) => item.trim()));
  }

  const lines: string[] = [];
  for (const technique of TECHNIQUE_DISPLAY_ORDER) {
    const items = groups.get(technique);
    if (!items?.length) continue;
    pushTechniqueGroup(lines, technique, items);
  }
  return lines;
}
