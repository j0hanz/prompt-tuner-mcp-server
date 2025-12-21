import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerPromptTemplateResources } from './prompt-templates.js';

export function registerAllResources(server: McpServer): void {
  registerPromptTemplateResources(server);
}
