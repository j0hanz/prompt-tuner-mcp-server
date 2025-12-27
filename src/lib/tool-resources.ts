import type { ContentBlock } from '../config/types.js';

const MARKDOWN_MIME_TYPE = 'text/markdown';

function sanitizeFilename(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '-');
}

function buildFileUri(filename: string): string {
  return `file:///${filename}`;
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
      uri: buildFileUri(filename),
      mimeType: MARKDOWN_MIME_TYPE,
      text: prompt,
    },
  };
}
