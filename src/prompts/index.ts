import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerQuickWorkflowPrompts } from './quick-workflows.js';

export function registerAllPrompts(server: McpServer): void {
  registerQuickWorkflowPrompts(server);
}
