import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

import { logger } from '../../lib/errors.js';
import { TOOL_NAME } from './constants.js';

export async function sendProgress(
  context: RequestHandlerExtra<ServerRequest, ServerNotification>,
  message: string,
  progress: number
): Promise<void> {
  const progressToken = context._meta?.progressToken;
  if (progressToken === undefined) return;

  try {
    await context.sendNotification({
      method: 'notifications/progress',
      params: {
        progressToken,
        progress,
        message,
        _meta: {
          tool: TOOL_NAME,
          requestId: context.requestId,
          sessionId: context.sessionId,
        },
      },
    });
  } catch (error) {
    logger.debug({ error }, 'analyze_prompt progress notification failed');
  }
}
