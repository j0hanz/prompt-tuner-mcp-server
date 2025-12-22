import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

import type { FormatDetectionResponse } from '../config/types.js';
import {
  createSuccessResponse,
  ErrorCode,
  toJsonRpcError,
} from '../lib/errors.js';
import { getToolContext } from '../lib/tool-context.js';
import { executeLLMWithJsonResponse } from '../lib/tool-helpers.js';
import { escapePromptForXml, validatePrompt } from '../lib/validation.js';
import {
  DetectFormatInputSchema,
  DetectFormatOutputSchema,
} from '../schemas/index.js';
import { FormatDetectionResponseSchema } from '../schemas/llm-responses.js';

const FORMAT_DETECTION_PROMPT = `<role>
You are an expert at detecting and classifying AI prompt formats.
</role>

<task>
Analyze the prompt and determine its target format with a confidence score.
</task>

<formats>
1. **Claude XML**: Uses semantic XML tags for structure
2. **GPT Markdown**: Uses Markdown headings and formatting
3. **JSON**: Structured schema or key-value patterns
4. **Auto**: No dominant format detected or multiple formats mixed
</formats>

<detection_criteria>
**Claude XML indicators (weight each 20%):**
- Semantic XML tags: <context>, <task>, <requirements>, <output_format>, <role>
- Angle-bracketed structure for organization
- Nested tag hierarchy
- XML-style attribute usage

**GPT Markdown indicators (weight each 20%):**
- Markdown headings: # for main sections, ## for subsections
- Emphasis markers: **bold**, *italic*, \`code\`
- Bullet lists (- or *) or numbered lists (1. 2. 3.)
- Horizontal rules (---)

**JSON indicators (weight each 20%):**
- Explicit JSON schema definition
- Curly braces with quoted keys: {"key": "value"}
- Request for JSON output format
- Schema validation language ("must be", "required fields")
</detection_criteria>

<confidence_scale>
| Confidence | Meaning                                        |
|------------|------------------------------------------------|
| 90-100     | Single clear format, no ambiguity              |
| 70-89      | Dominant format with minor mixed elements      |
| 50-69      | Multiple formats present, one slightly dominant|
| 0-49       | No clear format or heavily mixed (return auto) |
</confidence_scale>

<rules>
ALWAYS:
- Return a single detected format (the dominant one)
- Provide confidence as an integer (0-100)
- Give a specific, actionable recommendation
- Default to "auto" when confidence would be below 50

NEVER:
- Return multiple formats in detectedFormat field
- Give confidence above 90 if any mixed formatting is present
- Recommend mixing XML and Markdown
</rules>

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
  inputSchema: DetectFormatInputSchema.shape,
  outputSchema: DetectFormatOutputSchema.shape,
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
  input: DetectFormatInput,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<ReturnType<typeof createSuccessResponse>> {
  const context = getToolContext(extra);

  try {
    const validatedPrompt = validatePrompt(input.prompt);
    const safePrompt = escapePromptForXml(validatedPrompt);
    const detectionPrompt = `${FORMAT_DETECTION_PROMPT}\n\n<prompt_to_analyze>\n${safePrompt}\n</prompt_to_analyze>`;

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
    throw toJsonRpcError(error, ErrorCode.E_LLM_FAILED, input.prompt);
  }
}

// Registers the detect_format tool with the MCP server
export function registerDetectFormatTool(server: McpServer): void {
  server.registerTool('detect_format', DETECT_FORMAT_TOOL, handleDetectFormat);
}
