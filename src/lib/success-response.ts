import type { ContentBlock, SuccessResponse } from '../config/types.js';

export function createSuccessResponse<T extends Record<string, unknown>>(
  text: string,
  structured: T,
  extraContent: readonly ContentBlock[] = []
): SuccessResponse<T> {
  const structuredBlock: ContentBlock = {
    type: 'text',
    text: JSON.stringify(structured),
  };
  const messageBlock: ContentBlock = { type: 'text', text };
  return {
    content: [structuredBlock, messageBlock, ...extraContent],
    structuredContent: structured,
  };
}
