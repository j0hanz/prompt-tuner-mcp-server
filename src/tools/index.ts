// Tool registration aggregator for PromptTuner MCP
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ToolRegistrar } from '../config/types.js';
import { registerAnalyzePromptTool } from './analyze-prompt.js';
import { registerComparePromptsTool } from './compare-prompts.js';
import { registerDetectFormatTool } from './detect-format.js';
import { registerOptimizePromptTool } from './optimize-prompt.js';
import { registerRefinePromptTool } from './refine-prompt.js';
import { registerValidatePromptTool } from './validate-prompt.js';

/**
 * Array of tool registration functions.
 * Add new tools here to auto-register them.
 * Order determines registration priority.
 */
const TOOL_REGISTRARS: readonly ToolRegistrar[] = [
  registerRefinePromptTool,
  registerAnalyzePromptTool,
  registerOptimizePromptTool,
  registerDetectFormatTool,
  registerComparePromptsTool,
  registerValidatePromptTool,
] as const;

/**
 * Registers all PromptTuner tools with the MCP server.
 * Uses data-driven pattern for easy extensibility.
 */
export function registerAllTools(server: McpServer): void {
  for (const registrar of TOOL_REGISTRARS) {
    registrar(server);
  }
}
