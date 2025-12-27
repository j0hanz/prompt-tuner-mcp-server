import {
  OPTIMIZATION_TECHNIQUES,
  type OptimizationTechnique,
} from '../../config/types.js';
import { asBulletList } from '../../lib/tool-formatters.js';

const TECHNIQUE_SET = new Set(OPTIMIZATION_TECHNIQUES);
const TECHNIQUE_PREFIX_RE = /^([a-zA-Z]+)\s*:\s*(.+)$/;

function parseImprovement(improvement: string): {
  bucket: string;
  detail: string;
} {
  const match = TECHNIQUE_PREFIX_RE.exec(improvement);
  if (!match) {
    return { bucket: 'general', detail: improvement };
  }

  const technique = match[1] as OptimizationTechnique;
  const detail = match[2];
  if (!detail || !TECHNIQUE_SET.has(technique)) {
    return { bucket: 'general', detail: improvement };
  }

  return { bucket: technique, detail };
}

function groupImprovements(improvements: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const improvement of improvements) {
    const { bucket, detail } = parseImprovement(improvement);
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
  const groups = groupImprovements(improvements);
  if (groups.size === 1 && groups.has('general')) {
    return asBulletList(improvements);
  }

  const lines: string[] = [];
  for (const [technique, items] of groups) {
    lines.push(`Technique: ${technique}`);
    lines.push(...asBulletList(items));
  }
  return lines;
}
