import { inspect } from 'node:util';

import { writeStderr } from './output.js';

type LogFn = (payload: unknown, msg?: string) => void;

export interface Logger {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  debug: LogFn;
}

function formatFallbackPayload(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  return inspect(payload, { depth: 4, colors: false, breakLength: 120 });
}

function formatFallbackMessage(payload: unknown, msg?: string): string {
  if (msg) {
    return payload === undefined
      ? msg
      : `${msg} ${formatFallbackPayload(payload)}`;
  }
  return formatFallbackPayload(payload);
}

const fallbackLogger: Logger = {
  info: (payload: unknown, msg?: string): void => {
    writeStderr(formatFallbackMessage(payload, msg));
  },
  warn: (payload: unknown, msg?: string): void => {
    writeStderr(formatFallbackMessage(payload, msg));
  },
  error: (payload: unknown, msg?: string): void => {
    writeStderr(formatFallbackMessage(payload, msg));
  },
  debug: (payload: unknown, msg?: string): void => {
    writeStderr(formatFallbackMessage(payload, msg));
  },
};

let logger: Logger = fallbackLogger;

export function getLogger(): Logger {
  return logger;
}

export async function initLogger(): Promise<void> {
  const { logger: loadedLogger } = await import('../lib/errors.js');
  logger = loadedLogger;
}
