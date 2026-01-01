import type { ProviderInfo } from '../config/types.js';

export interface OutputSection {
  readonly title: string;
  readonly lines: readonly string[];
}

export function buildOutput(
  title: string,
  meta: readonly string[],
  sections: readonly OutputSection[],
  footer: readonly string[] = []
): string {
  const lines: string[] = [`# ${title}`];

  if (meta.length) {
    lines.push(...meta.map((line) => `- ${line}`));
  }

  for (const section of sections) {
    lines.push('', `## ${section.title}`, ...section.lines);
  }

  if (footer.length) {
    lines.push('', ...footer);
  }

  return lines.join('\n');
}

export function asBulletList(items: readonly string[]): string[] {
  return items.map((item) => `- ${item}`);
}

export function asNumberedList(items: readonly string[]): string[] {
  return items.map((item, index) => `${index + 1}. ${item}`);
}

export function asCodeBlock(text: string): string[] {
  return ['```', text, '```'];
}

export function formatProviderLine(provider: ProviderInfo): string {
  return `Provider: ${provider.provider} (${provider.model})`;
}
