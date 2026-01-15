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

type OnRequestHandler = (request: unknown, extra?: unknown) => void;
type OnInitializedHandler = () => void;

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
        const error = new RpcMcpError(
          RpcErrorCode.InvalidParams,
          `Unsupported protocol version: ${protocolVersion} (supported: ${SUPPORTED_PROTOCOL_VERSIONS.join(
            ', '
          )})`
        );
        setTimeout(() => {
          server.close().catch((closeError: unknown) => {
            logger.error(
              { err: closeError, protocolVersion },
              'Failed to close server after protocol mismatch'
            );
          });
        }, 0);
        throw error;
      }
      return await baseInitialize(request);
    }
  );
}

function enforceInitializeFirst(server: McpServer): void {
  const protocol = server.server as unknown as {
    _onrequest?: OnRequestHandler;
    oninitialized?: OnInitializedHandler;
    _transport?: { send: (message: unknown) => Promise<void> };
  };

  const baseOnRequest = protocol._onrequest?.bind(server.server);
  if (!baseOnRequest) {
    logger.warn(
      'Initialize gating unavailable (SDK internals changed). Proceeding without lifecycle guard.'
    );
    return;
  }

  let initialized = false;
  const baseOnInitialized = protocol.oninitialized?.bind(server.server);
  protocol.oninitialized = (): void => {
    initialized = true;
    baseOnInitialized?.();
  };

  protocol._onrequest = (request: unknown, extra?: unknown): void => {
    const method =
      typeof request === 'object' && request !== null && 'method' in request
        ? (request as { method?: unknown }).method
        : undefined;
    if (!initialized && method !== 'initialize' && method !== 'ping') {
      const id =
        typeof request === 'object' && request !== null && 'id' in request
          ? (request as { id?: unknown }).id
          : undefined;
      const errorResponse = {
        jsonrpc: '2.0',
        id,
        error: {
          code: RpcErrorCode.InvalidRequest,
          message: 'Server not initialized',
        },
      };
      protocol._transport?.send(errorResponse).catch((error: unknown) => {
        logger.error({ err: error }, 'Failed to send initialize error');
      });
      return;
    }
    baseOnRequest(request, extra);
  };
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
        tools: { listChanged: false },
      },
    }
  );

  registerPromptTools(server);
  enforceStrictProtocolVersion(server);
  enforceInitializeFirst(server);
  disableSdkToolInputValidation(server);

  return server;
}

export async function startServer(): Promise<McpServer> {
  const server = createServer();
  await server.connect(new StdioServerTransport());

  logger.info(
    `${styleText('green', SERVER_NAME)} v${styleText('blue', SERVER_VERSION)} started`
  );
  try {
    await server.sendLoggingMessage({
      level: 'info',
      logger: SERVER_NAME,
      data: { event: 'start', version: SERVER_VERSION },
    });
  } catch (error) {
    logger.debug({ err: error }, 'Failed to send MCP log message');
  }

  return server;
}
