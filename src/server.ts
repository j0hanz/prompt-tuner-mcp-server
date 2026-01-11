import process from 'node:process';
import { styleText } from 'node:util';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  type InitializeRequest,
  InitializeRequestSchema,
  type InitializeResult,
  ErrorCode as RpcErrorCode,
  McpError as RpcMcpError,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/sdk/types.js';

import { SERVER_INSTRUCTIONS, SERVER_NAME, SERVER_VERSION } from './config.js';
import { logger } from './lib/errors.js';
import { registerPromptTools } from './tools.js';

process.on('warning', (warning) => {
  const code = 'code' in warning ? warning.code : undefined;
  logger.warn(
    { message: warning.message, code },
    `Node.js warning: ${warning.name}`
  );
});

type InitializeHandler = (
  request: InitializeRequest
) => Promise<InitializeResult>;

function enforceStrictProtocolVersion(server: McpServer): void {
  const baseInitialize = (
    server.server as unknown as { _oninitialize?: InitializeHandler }
  )._oninitialize?.bind(server.server);
  if (!baseInitialize) {
    logger.warn(
      'Strict protocol version check unavailable (SDK internals changed). Falling back to SDK default initialize handler.'
    );
    return;
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
        tools: { listChanged: true },
      },
    }
  );

  registerPromptTools(server);
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
