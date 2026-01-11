import process from 'node:process';
import { styleText } from 'node:util';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  type InitializeRequest,
  InitializeRequestSchema,
  type InitializeResult,
  type ReadResourceResult,
  ErrorCode as RpcErrorCode,
  McpError as RpcMcpError,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/sdk/types.js';

import { z } from 'zod';

import { SERVER_INSTRUCTIONS, SERVER_NAME, SERVER_VERSION } from './config.js';
import { logger } from './lib/errors.js';
import { wrapPromptData } from './lib/prompt-utils.js';
import { buildPromptSchema } from './schemas.js';
import { registerPromptTools } from './tools.js';

process.on('warning', (warning) => {
  const code = 'code' in warning ? warning.code : undefined;
  logger.warn(
    { message: warning.message, code },
    `Node.js warning: ${warning.name}`
  );
});

interface TemplateResource {
  readonly uri: string;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly mimeType: string;
  readonly text: string;
}

const TEMPLATE_CATALOG_URI = 'templates://catalog';

const TEMPLATE_RESOURCES: readonly TemplateResource[] = [
  {
    uri: 'templates://coding/code-review',
    name: 'code-review',
    title: 'Code Review Checklist',
    description: 'Structured checklist for reviewing code changes.',
    category: 'coding',
    mimeType: 'text/markdown',
    text: `# Code Review Checklist

## Role
You are a senior software engineer performing a code review.

## Goals
- Identify correctness bugs and edge cases
- Flag security and privacy risks
- Note performance, reliability, and maintainability issues
- Suggest concrete improvements

## Review Checklist
- Correctness: Does the change do what it claims in all cases?
- Security: Any injection, auth, or data exposure issues?
- Reliability: Error handling, retries, timeouts, and cleanup
- Performance: Hot paths, allocations, latency, and caching
- Consistency: Aligns with existing conventions and patterns
- Tests: Adequate coverage and negative cases

## Output Format
1. Critical issues (if any)
2. Warnings
3. Suggestions
4. Tests to add or run
`,
  },
];

interface TemplateCatalogEntry {
  readonly uri: string;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly mimeType: string;
}

const TEMPLATE_CATALOG: readonly TemplateCatalogEntry[] =
  TEMPLATE_RESOURCES.map(
    ({ uri, name, title, description, category, mimeType }) => ({
      uri,
      name,
      title,
      description,
      category,
      mimeType,
    })
  );

function buildTextResource(
  uri: string,
  mimeType: string,
  text: string
): ReadResourceResult {
  return {
    contents: [
      {
        uri,
        mimeType,
        text,
      },
    ],
  };
}

function buildCatalogResource(): ReadResourceResult {
  const payload = JSON.stringify({ templates: TEMPLATE_CATALOG }, null, 2);
  return buildTextResource(TEMPLATE_CATALOG_URI, 'application/json', payload);
}

export function registerTemplateResources(server: McpServer): void {
  server.registerResource(
    'template-catalog',
    TEMPLATE_CATALOG_URI,
    {
      title: 'Template Catalog',
      description: 'Available prompt templates.',
      mimeType: 'application/json',
    },
    () => buildCatalogResource()
  );

  for (const template of TEMPLATE_RESOURCES) {
    server.registerResource(
      `template-${template.category}-${template.name}`,
      template.uri,
      {
        title: template.title,
        description: template.description,
        mimeType: template.mimeType,
      },
      () => buildTextResource(template.uri, template.mimeType, template.text)
    );
  }
}

interface QuickWorkflowArgs {
  prompt: string;
}

interface QuickWorkflowDefinition {
  name: string;
  title: string;
  description: string;
  argsSchema: z.ZodRawShape;
  parseArgs: (args: unknown) => QuickWorkflowArgs;
  buildText: (args: QuickWorkflowArgs) => string;
}

function buildPromptMessage(text: string): {
  messages: {
    role: 'user';
    content: { type: 'text'; text: string };
  }[];
} {
  return {
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text,
        },
      },
    ],
  };
}

function promptArg(description: string): {
  argsSchema: z.ZodRawShape;
  parseArgs: (args: unknown) => QuickWorkflowArgs;
} {
  const promptSchema = buildPromptSchema(description);
  const schema = z.strictObject({
    prompt: promptSchema,
  });
  return {
    argsSchema: schema.shape,
    parseArgs: (args) => schema.parse(args),
  };
}

const QUICK_WORKFLOW_PROMPTS: QuickWorkflowDefinition[] = [
  {
    name: 'fix',
    title: 'Fix Prompt',
    description: 'Fix spelling and grammar only.',
    ...promptArg('The prompt to fix'),
    buildText: ({ prompt }) =>
      [
        'Fix spelling and grammar in the following text. Do not rewrite or add content.',
        '',
        wrapPromptData(prompt),
      ].join('\n'),
  },
  {
    name: 'boost',
    title: 'Boost Prompt',
    description: 'Refine and enhance a prompt for clarity and effectiveness.',
    ...promptArg('The prompt to boost'),
    buildText: ({ prompt }) =>
      [
        'Improve the following prompt to be clearer and more effective while preserving intent.',
        'Return only the improved prompt.',
        '',
        wrapPromptData(prompt),
      ].join('\n'),
  },
];

export function registerQuickWorkflowPrompts(server: McpServer): void {
  for (const workflow of QUICK_WORKFLOW_PROMPTS) {
    server.registerPrompt(
      workflow.name,
      {
        title: workflow.title,
        description: workflow.description,
        argsSchema: workflow.argsSchema,
      },
      (args) => {
        const workflowArgs = workflow.parseArgs(args);
        return buildPromptMessage(workflow.buildText(workflowArgs));
      }
    );
  }
}

type InitializeHandler = (
  request: InitializeRequest
) => Promise<InitializeResult>;

function enforceStrictProtocolVersion(server: McpServer): void {
  const baseInitialize = (
    server.server as unknown as { _oninitialize?: InitializeHandler }
  )._oninitialize?.bind(server.server);
  if (!baseInitialize) {
    throw new Error('Strict protocol version check unavailable.');
  }

  server.server.setRequestHandler(
    InitializeRequestSchema,
    async (request): Promise<InitializeResult> => {
      const { protocolVersion } = request.params;
      if (!SUPPORTED_PROTOCOL_VERSIONS.includes(protocolVersion)) {
        throw new RpcMcpError(
          RpcErrorCode.InvalidParams,
          `Unsupported protocol version: ${protocolVersion} (supported: ${SUPPORTED_PROTOCOL_VERSIONS.join(
            ', '
          )})`
        );
      }
      return await baseInitialize(request);
    }
  );
}

type ToolInputValidator = (
  tool: unknown,
  args: unknown,
  toolName: string
) => Promise<unknown>;

function disableSdkToolInputValidation(server: McpServer): void {
  const validationTarget = server as unknown as {
    validateToolInput?: ToolInputValidator;
  };

  if (!validationTarget.validateToolInput) return;
  validationTarget.validateToolInput = (_tool, args): Promise<unknown> =>
    Promise.resolve(args);
}

function createServer(): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      instructions: SERVER_INSTRUCTIONS,
      capabilities: {
        logging: {},
        resources: { listChanged: true },
        tools: { listChanged: true },
        prompts: { listChanged: true },
      },
    }
  );

  registerPromptTools(server);
  registerTemplateResources(server);
  registerQuickWorkflowPrompts(server);
  enforceStrictProtocolVersion(server);
  disableSdkToolInputValidation(server);

  return server;
}

export async function startServer(): Promise<McpServer> {
  const server = createServer();
  await server.connect(new StdioServerTransport());

  logger.info(
    `${styleText('green', SERVER_NAME)} v${styleText('blue', SERVER_VERSION)} started`
  );

  return server;
}
