import { inspect, parseArgs } from 'node:util';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function writeStderr(message: string): void {
  process.stderr.write(message.endsWith('\n') ? message : `${message}\n`);
}

export function writeCliOutput(message: string): void {
  const stream = process.stdout.isTTY ? process.stdout : process.stderr;
  stream.write(message.endsWith('\n') ? message : `${message}\n`);
}

const CLI_OPTIONS = {
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  debug: { type: 'boolean' },
  includeErrorContext: { type: 'boolean' },
  llmProvider: { type: 'string' },
  llmModel: { type: 'string' },
  llmTimeoutMs: { type: 'string' },
  llmMaxTokens: { type: 'string' },
  maxPromptLength: { type: 'string' },
} as const;

const LLM_PROVIDERS = new Set(['openai', 'anthropic', 'google']);

export interface CliValues {
  help: boolean;
  version: boolean;
  debug?: boolean;
  includeErrorContext?: boolean;
  llmProvider?: string;
  llmModel?: string;
  llmTimeoutMs?: string;
  llmMaxTokens?: string;
  maxPromptLength?: string;
}

type ParsedCliValues = Record<
  keyof typeof CLI_OPTIONS,
  string | boolean | undefined
>;

const BOOLEAN_KEYS = ['debug', 'includeErrorContext'] as const;
const STRING_KEYS = [
  'llmProvider',
  'llmModel',
  'llmTimeoutMs',
  'llmMaxTokens',
  'maxPromptLength',
] as const;

export function parseCli(): CliValues {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: CLI_OPTIONS,
    strict: true,
    allowPositionals: false,
    allowNegative: true,
  }) as { values: ParsedCliValues };

  const cli: CliValues = {
    help: values.help === true,
    version: values.version === true,
  };

  for (const key of BOOLEAN_KEYS) {
    const value = values[key];
    if (typeof value === 'boolean') {
      cli[key] = value;
    }
  }

  for (const key of STRING_KEYS) {
    const value = values[key];
    if (typeof value === 'string') {
      cli[key] = value;
    }
  }

  return cli;
}

function applyBooleanEnv(name: string, value: boolean | undefined): void {
  if (typeof value !== 'boolean') return;
  process.env[name] = value ? 'true' : 'false';
}

function applyStringEnv(name: string, value: string | undefined): void {
  if (value === undefined) return;
  process.env[name] = value;
}

function applyEnumEnv(
  name: string,
  value: string | undefined,
  allowed: Set<string>,
  flag: string
): void {
  if (value === undefined) return;
  if (!allowed.has(value)) {
    throw new Error(`Invalid ${flag}: ${value}`);
  }
  process.env[name] = value;
}

function applyNumberEnv(
  name: string,
  value: string | undefined,
  flag: string
): void {
  if (value === undefined) return;
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid ${flag}: ${value}`);
  }
  process.env[name] = value;
}

export function applyEnvOverrides(values: CliValues): void {
  applyBooleanEnv('DEBUG', values.debug);
  applyBooleanEnv('INCLUDE_ERROR_CONTEXT', values.includeErrorContext);
  applyEnumEnv(
    'LLM_PROVIDER',
    values.llmProvider,
    LLM_PROVIDERS,
    '--llm-provider'
  );
  applyStringEnv('LLM_MODEL', values.llmModel);
  applyNumberEnv('LLM_TIMEOUT_MS', values.llmTimeoutMs, '--llm-timeout-ms');
  applyNumberEnv('LLM_MAX_TOKENS', values.llmMaxTokens, '--llm-max-tokens');
  applyNumberEnv(
    'MAX_PROMPT_LENGTH',
    values.maxPromptLength,
    '--max-prompt-length'
  );
}

export function printHelp(): void {
  writeCliOutput(`Usage: prompt-tuner-mcp-server [options]

Options:
  -h, --help                    Show help text
  -v, --version                 Print version
  --debug / --no-debug          Override DEBUG
  --include-error-context       Override INCLUDE_ERROR_CONTEXT
  --no-include-error-context
  --llm-provider <provider>     openai | anthropic | google
  --llm-model <name>            Override LLM_MODEL
  --llm-timeout-ms <number>     Override LLM_TIMEOUT_MS
  --llm-max-tokens <number>     Override LLM_MAX_TOKENS
  --max-prompt-length <number>  Override MAX_PROMPT_LENGTH

CLI flags override environment variables.`);
}

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
  const { logger: loadedLogger } = await import('./lib/errors.js');
  logger = loadedLogger;
}

const SHUTDOWN_DELAY_MS = 500;
const SIGNALS = ['SIGHUP', 'SIGINT', 'SIGTERM'] as const;

let server: McpServer | null = null;
let shuttingDown = false;

function logSecondShutdown(reason: string): void {
  const log = getLogger();
  log.error({ reason }, 'Second shutdown, exiting');
}

function logShutdown(reason: string, err?: unknown): void {
  const log = getLogger();
  if (err) {
    log.error({ err, reason }, 'Server shutting down due to error');
  } else {
    log.info({ reason }, 'Server shutting down');
  }
}

function startForcedShutdownTimer(): NodeJS.Timeout {
  const log = getLogger();
  return setTimeout(() => {
    log.error({ delayMs: SHUTDOWN_DELAY_MS }, 'Forced shutdown due to timeout');
    process.exit(1);
  }, SHUTDOWN_DELAY_MS);
}

async function closeServer(): Promise<boolean> {
  if (!server?.isConnected()) return true;
  try {
    await server.close();
    return true;
  } catch (closeError) {
    const log = getLogger();
    log.error({ err: closeError }, 'Error during shutdown');
    return false;
  }
}

export function setServer(instance: McpServer | null): void {
  server = instance;
}

export function registerProcessHandlers(): void {
  for (const signal of SIGNALS) {
    process.once(signal, () => {
      void shutdown(signal);
    });
  }

  process.once('uncaughtException', (err) => {
    void shutdown('uncaughtException', err);
  });
  process.once('unhandledRejection', (err) => {
    void shutdown('unhandledRejection', err);
  });
}

export async function shutdown(reason: string, err?: unknown): Promise<void> {
  if (shuttingDown) {
    logSecondShutdown(reason);
    process.exit(1);
    return;
  }

  shuttingDown = true;
  logShutdown(reason, err);

  const timeout = startForcedShutdownTimer();
  let exitCode = err ? 1 : 0;
  if (!(await closeServer())) exitCode = 1;

  clearTimeout(timeout);
  process.exit(exitCode);
}

export async function configureTelemetry(): Promise<() => void> {
  const { config } = await import('./config.js');
  if (!config.DEBUG) return () => {};

  const log = getLogger();
  const telemetry = await import('./lib/telemetry.js');
  const stopEventLoop = telemetry.startEventLoopProbe();
  const unsubscribeLlm = telemetry.subscribeLlmRequests((event) => {
    log.debug({ event }, 'LLM request');
  });
  const unsubscribeLoop = telemetry.subscribeEventLoopStats((stats) => {
    log.debug({ stats }, 'Event loop health');
  });

  return () => {
    unsubscribeLlm();
    unsubscribeLoop();
    stopEventLoop();
  };
}
