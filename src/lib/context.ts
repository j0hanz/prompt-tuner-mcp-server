import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  requestId: string;
  toolName?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Generates a cryptographically secure UUID for request tracking.
 * Uses Node.js built-in crypto.randomUUID() for better performance and security.
 */
export function generateRequestId(): string {
  return randomUUID();
}

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return requestContext.run(context, fn);
}

export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}
