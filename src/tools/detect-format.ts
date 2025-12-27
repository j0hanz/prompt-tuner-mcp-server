import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

import type {
  ErrorResponse,
  FormatDetectionResponse,
} from '../config/types.js';
import {
  createErrorResponse,
  createSuccessResponse,
  ErrorCode,
} from '../lib/errors.js';
import {
  INPUT_HANDLING_SECTION,
  wrapPromptData,
} from '../lib/prompt-policy.js';
import { getToolContext } from '../lib/tool-context.js';
import { executeLLMWithJsonResponse } from '../lib/tool-helpers.js';
import { validatePrompt } from '../lib/validation.js';
import {
  DetectFormatInputSchema,
  DetectFormatOutputSchema,
} from '../schemas/index.js';
import { FormatDetectionResponseSchema } from '../schemas/llm-responses.js';

const FORMAT_DETECTION_PROMPT = `<role>
You are an expert at detecting and classifying AI prompt formats.
</role>

<task>
Identify the dominant prompt format and return a confidence score with a recommendation.
</task>

${INPUT_HANDLING_SECTION}

<workflow>
1. Read the input prompt.
2. Check for format indicators.
3. Choose the dominant format or "auto".
4. Provide confidence (0-100) and a short recommendation.
</workflow>

<formats>
- Claude XML: semantic XML tags
- GPT Markdown: headings, lists, emphasis
- JSON: schemas or explicit JSON output requests
- Auto: mixed or no dominant format
</formats>

<detection_criteria>
Claude XML indicators:
- Semantic tags (<context>, <task>, <requirements>)
- Nested tag structure
- XML-style attributes

GPT Markdown indicators:
- Headings (#, ##)
- Lists or numbered steps
- Emphasis (**bold**, \`code\`)

JSON indicators:
- JSON schema or quoted keys with braces
- Explicit "return JSON" instructions
</detection_criteria>

<confidence_scale>
| Confidence | Meaning                                  |
|------------|------------------------------------------|
| 90-100     | Single clear format, no ambiguity        |
| 70-89      | Dominant format with minor mixed elements|
| 50-69      | Mixed formats, one slightly dominant     |
| 0-49       | No clear format (return auto)            |
</confidence_scale>

<rules>
ALWAYS:
- Follow the workflow steps in order
- Use only the provided input; do not invent details
- Return a single detected format
- Provide confidence as an integer (0-100)
- Default to "auto" when confidence would be below 50

ASK:
- If mixed signals are strong, mention the ambiguity in the recommendation

NEVER:
- Return multiple formats in detectedFormat
- Give confidence above 90 if mixed formatting is present
- Recommend mixing XML and Markdown in the same prompt
- Output anything outside the required JSON schema
</rules>

<output_rules>
Return valid JSON only. No markdown, no code fences, or extra text.
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
  "recommendation": "The prompt uses Markdown headings and lists; add an explicit output section to strengthen GPT structure."
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
  inputSchema: DetectFormatInputSchema.shape,
  outputSchema: DetectFormatOutputSchema.shape,
  annotations: {
    readOnlyHint: true,
    idempotentHint: false,
    openWorldHint: true,
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
  input: DetectFormatInput,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<ReturnType<typeof createSuccessResponse> | ErrorResponse> {
  const context = getToolContext(extra);

  try {
    const validatedPrompt = validatePrompt(input.prompt);
    const detectionPrompt = `${FORMAT_DETECTION_PROMPT}\n\n<prompt_to_analyze>\n${wrapPromptData(
      validatedPrompt
    )}\n</prompt_to_analyze>`;

    const parsed = await executeLLMWithJsonResponse<FormatDetectionResponse>(
      detectionPrompt,
      (value) => FormatDetectionResponseSchema.parse(value),
      ErrorCode.E_LLM_FAILED,
      'detect_format',
      { maxTokens: 500, signal: context.request.signal }
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
