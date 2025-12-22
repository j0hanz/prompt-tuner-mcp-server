import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

export type ToolContext = RequestHandlerExtra<
  ServerRequest,
  ServerNotification
> & {
  request: { signal: AbortSignal };
};

export function getToolContext(
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): ToolContext {
  return {
    ...extra,
    request: { signal: extra.signal },
  };
}
