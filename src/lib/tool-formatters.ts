export interface OutputSection {
  title: string;
  lines: string[];
}

export function buildOutput(
  title: string,
  meta: string[],
  sections: OutputSection[],
  footer: string[] = []
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

export function asBulletList(items: string[]): string[] {
  return items.map((item) => `- ${item}`);
}

export function asNumberedList(items: string[]): string[] {
  return items.map((item, index) => `${index + 1}. ${item}`);
}

export function asCodeBlock(text: string): string[] {
  return ['```', text, '```'];
}

export function formatProviderLine(provider: {
  provider: string;
  model: string;
}): string {
  return `Provider: ${provider.provider} (${provider.model})`;
}
