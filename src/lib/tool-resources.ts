import type { ContentBlock } from '../config/types.js';

function sanitizeFilename(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '-');
}

export function buildPromptResourceBlock(
  prompt: string,
  baseName: string
): ContentBlock {
  const safeBase = sanitizeFilename(baseName) || 'prompt';
  const filename = safeBase.endsWith('.md') ? safeBase : `${safeBase}.md`;

  return {
    type: 'resource',
    resource: {
      uri: `file:///${filename}`,
      mimeType: 'text/markdown',
      text: prompt,
    },
  };
}
