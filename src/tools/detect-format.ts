// Detect Format Tool - LLM-powered format detection
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { FormatDetectionResponse } from '../config/types.js';
import {
  createErrorResponse,
  createSuccessResponse,
  ErrorCode,
} from '../lib/errors.js';
import { executeLLMWithJsonResponse } from '../lib/tool-helpers.js';
import { validatePrompt } from '../lib/validation.js';
import {
  DetectFormatInputSchema,
  DetectFormatOutputSchema,
} from '../schemas/index.js';
import { FormatDetectionResponseSchema } from '../schemas/llm-responses.js';

const FORMAT_DETECTION_PROMPT = `You are an expert at detecting AI prompt formats. Analyze the prompt and determine its target format.

<formats>
1. **Claude XML**: Uses <context>, <task>, <requirements>, <output_format> tags
2. **GPT Markdown**: Uses ## headers, **bold**, bullet lists, numbered steps
3. **JSON**: Structured data format with schemas and key-value patterns
4. **Auto/Generic**: No specific format detected
</formats>

<detection_criteria>
Claude XML indicators:
- Presence of XML tags like <context>, <task>, <instructions>
- Structured semantic sections in angle brackets
- Anthropic-style formatting

GPT Markdown indicators:
- ## Headers for sections
- **Bold** emphasis
- Bullet lists with - or *
- Markdown syntax

JSON indicators:
- Schema definitions
- Key-value pair structures  
- Curly braces and quotes
- Data extraction focus
</detection_criteria>

**CRITICAL: Your response MUST be valid, parseable JSON only. No markdown, no code blocks, no explanatory text.**

1. Start your response with { (opening brace)
2. End your response with } (closing brace)  
3. Use proper JSON syntax: double quotes for strings, no trailing commas
4. All required fields MUST be present
5. Do NOT wrap in \`\`\`json code blocks

Example valid response:
{
  "detectedFormat": "gpt",
  "confidence": 85,
  "recommendation": "This prompt uses Markdown headers (##), bold emphasis (**), and bullet lists, indicating GPT format. Consider adding more specific examples."
}

Required JSON schema:
{
  "detectedFormat": "claude" | "gpt" | "json" | "auto",
  "confidence": number (0-100),
  "recommendation": string
}`;

/**
 * Registers the detect_format tool with the MCP server.
 * Uses external LLM to detect format.
 */
export function registerDetectFormatTool(server: McpServer): void {
  server.registerTool(
    'detect_format',
    {
      title: 'Detect Format',
      description:
        'Identify if prompt targets Claude XML, GPT Markdown, or JSON schema using AI analysis. Returns confidence score and recommendations.',
      inputSchema: DetectFormatInputSchema,
      outputSchema: DetectFormatOutputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({
      prompt,
    }): Promise<
      | ReturnType<typeof createSuccessResponse>
      | ReturnType<typeof createErrorResponse>
    > => {
      try {
        const validatedPrompt = validatePrompt(prompt);
        const detectionPrompt = `${FORMAT_DETECTION_PROMPT}\n\nPROMPT TO ANALYZE:\n${validatedPrompt}`;

        const parsed =
          await executeLLMWithJsonResponse<FormatDetectionResponse>(
            detectionPrompt,
            (value) => FormatDetectionResponseSchema.parse(value),
            ErrorCode.E_LLM_FAILED,
            'detect_format',
            { maxTokens: 500 }
          );

        const output = `# Format Detection\n\n**Detected Format**: ${parsed.detectedFormat}\n**Confidence**: ${parsed.confidence}%\n\n**Recommendation**:\n${parsed.recommendation}`;

        return createSuccessResponse(output, {
          ok: true,
          detectedFormat: parsed.detectedFormat,
          confidence: parsed.confidence,
          recommendation: parsed.recommendation,
        });
      } catch (error) {
        return createErrorResponse(error, ErrorCode.E_LLM_FAILED, prompt);
      }
    }
  );
}
