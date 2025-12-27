import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ToolRegistrar } from '../config/types.js';
import { registerAnalyzePromptTool } from './analyze-prompt.js';
import { registerOptimizePromptTool } from './optimize-prompt.js';
import { registerRefinePromptTool } from './refine-prompt.js';
import { registerValidatePromptTool } from './validate-prompt.js';

// Tool registration functions
const TOOL_REGISTRARS: readonly ToolRegistrar[] = [
  registerRefinePromptTool,
  registerAnalyzePromptTool,
  registerOptimizePromptTool,
  registerValidatePromptTool,
] as const;

// Registers all PromptTuner tools with the MCP server
export function registerAllTools(server: McpServer): void {
  for (const registrar of TOOL_REGISTRARS) {
    registrar(server);
  }
}
