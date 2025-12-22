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

const FORMAT_DETECTION_PROMPT = `<role>
You are an expert at detecting AI prompt formats.
</role>

<task>
Analyze the prompt and determine its target format.
</task>

<formats>
1. Claude XML: Uses tags such as <context>, <task>, <requirements>, <output_format>
2. GPT Markdown: Uses Markdown headings, emphasis, and bullet lists
3. JSON: Structured schema or key-value patterns
4. Auto: No dominant format detected
</formats>

<detection_criteria>
Claude XML indicators:
- XML tags for semantic sections
- Angle-bracketed structure

GPT Markdown indicators:
- Markdown heading structure
- Emphasis markers
- Bullet or numbered lists

JSON indicators:
- Explicit schema or key-value structures
- Curly braces with quoted keys
</detection_criteria>

<decision_rules>
- If multiple formats appear, choose the dominant one.
- If ambiguous, return "auto" with confidence 60 or lower.
- Provide a single-sentence recommendation to improve format clarity.
</decision_rules>

<output_rules>
Return valid JSON only. No markdown, no code fences, no extra text.
Requirements:
1. Start with { and end with }
2. Double quotes for all strings
3. No trailing commas
4. Include every required field
</output_rules>

<example_json>
{
  "detectedFormat": "gpt",
  "confidence": 85,
  "recommendation": "The prompt uses Markdown-style headings and lists; add an explicit output section to strengthen GPT structure."
}
</example_json>

<schema>
{
  "detectedFormat": "claude" | "gpt" | "json" | "auto",
  "confidence": number (0-100),
  "recommendation": string
}
</schema>

<final_reminder>
Return JSON only. No markdown. No code fences. No extra text.
</final_reminder>`;

interface DetectFormatInput {
  prompt: string;
}

const DETECT_FORMAT_TOOL = {
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
};

function formatDetectionOutput(parsed: FormatDetectionResponse): string {
  return [
    '# Format Detection',
    '',
    `**Detected Format**: ${parsed.detectedFormat}`,
    `**Confidence**: ${parsed.confidence}%`,
    '',
    '**Recommendation**:',
    parsed.recommendation,
  ].join('\n');
}

async function handleDetectFormat(
  input: DetectFormatInput
): Promise<
  | ReturnType<typeof createSuccessResponse>
  | ReturnType<typeof createErrorResponse>
> {
  try {
    const validatedPrompt = validatePrompt(input.prompt);
    const detectionPrompt = `${FORMAT_DETECTION_PROMPT}\n\n<prompt_to_analyze>\n${validatedPrompt}\n</prompt_to_analyze>`;

    const parsed = await executeLLMWithJsonResponse<FormatDetectionResponse>(
      detectionPrompt,
      (value) => FormatDetectionResponseSchema.parse(value),
      ErrorCode.E_LLM_FAILED,
      'detect_format',
      { maxTokens: 500 }
    );

    const output = formatDetectionOutput(parsed);
    return createSuccessResponse(output, {
      ok: true,
      detectedFormat: parsed.detectedFormat,
      confidence: parsed.confidence,
      recommendation: parsed.recommendation,
    });
  } catch (error) {
    return createErrorResponse(error, ErrorCode.E_LLM_FAILED, input.prompt);
  }
}

// Registers the detect_format tool with the MCP server
export function registerDetectFormatTool(server: McpServer): void {
  server.registerTool('detect_format', DETECT_FORMAT_TOOL, handleDetectFormat);
}
