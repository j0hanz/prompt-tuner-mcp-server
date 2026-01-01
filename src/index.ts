#!/usr/bin/env node
import { parseArgs } from 'node:util';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

type LogFn = (payload: unknown, msg?: string) => void;

interface Logger {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  debug: LogFn;
}

const fallbackLogger: Logger = {
  info: (payload: unknown, msg?: string): void => {
    if (msg) {
      console.log(msg, payload);
      return;
    }
    console.log(payload);
  },
  warn: (payload: unknown, msg?: string): void => {
    if (msg) {
      console.warn(msg, payload);
      return;
    }
    console.warn(payload);
  },
  error: (payload: unknown, msg?: string): void => {
    if (msg) {
      console.error(msg, payload);
      return;
    }
    console.error(payload);
  },
  debug: (payload: unknown, msg?: string): void => {
    if (msg) {
      console.debug(msg, payload);
      return;
    }
    console.debug(payload);
  },
};

let logger: Logger = fallbackLogger;

const SHUTDOWN_DELAY_MS = 500;
const SIGNALS = ['SIGHUP', 'SIGINT', 'SIGTERM'] as const;

let server: McpServer | null = null;
let shuttingDown = false;

const CLI_OPTIONS = {
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  logFormat: { type: 'string' },
  debug: { type: 'boolean' },
  includeErrorContext: { type: 'boolean' },
  llmProvider: { type: 'string' },
  llmModel: { type: 'string' },
  llmTimeoutMs: { type: 'string' },
  llmMaxTokens: { type: 'string' },
  maxPromptLength: { type: 'string' },
} as const;

interface CliValues {
  help: boolean;
  version: boolean;
  logFormat?: string;
  debug?: boolean;
  includeErrorContext?: boolean;
  llmProvider?: string;
  llmModel?: string;
  llmTimeoutMs?: string;
  llmMaxTokens?: string;
  maxPromptLength?: string;
}

function parseCli(): CliValues {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: CLI_OPTIONS,
    strict: true,
    allowPositionals: false,
    allowNegative: true,
  });

  return {
    help: values.help ?? false,
    version: values.version ?? false,
    logFormat: values.logFormat,
    debug: values.debug,
    includeErrorContext: values.includeErrorContext,
    llmProvider: values.llmProvider,
    llmModel: values.llmModel,
    llmTimeoutMs: values.llmTimeoutMs,
    llmMaxTokens: values.llmMaxTokens,
    maxPromptLength: values.maxPromptLength,
  };
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

function applyEnvOverrides(values: CliValues): void {
  applyEnumEnv(
    'LOG_FORMAT',
    values.logFormat,
    new Set(['text', 'json']),
    '--log-format'
  );
  applyBooleanEnv('DEBUG', values.debug);
  applyBooleanEnv('INCLUDE_ERROR_CONTEXT', values.includeErrorContext);
  applyEnumEnv(
    'LLM_PROVIDER',
    values.llmProvider,
    new Set(['openai', 'anthropic', 'google']),
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

function printHelp(): void {
  console.log(`Usage: prompt-tuner-mcp-server [options]

Options:
  -h, --help                    Show help text
  -v, --version                 Print version
  --log-format <text|json>      Override LOG_FORMAT
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

function logSecondShutdown(reason: string): void {
  logger.error({ reason }, 'Second shutdown, exiting');
}

function logShutdown(reason: string, err?: unknown): void {
  if (err) {
    logger.error({ err, reason }, 'Server shutting down due to error');
  } else {
    logger.info({ reason }, 'Server shutting down');
  }
}

function startForcedShutdownTimer(): NodeJS.Timeout {
  return setTimeout(() => {
    logger.error(
      { delayMs: SHUTDOWN_DELAY_MS },
      'Forced shutdown due to timeout'
    );
    process.exit(1);
  }, SHUTDOWN_DELAY_MS);
}

async function closeServer(): Promise<boolean> {
  if (!server?.isConnected()) return true;
  try {
    await server.close();
    return true;
  } catch (closeError) {
    logger.error({ err: closeError }, 'Error during shutdown');
    return false;
  }
}

async function shutdown(reason: string, err?: unknown): Promise<void> {
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

async function initLogger(): Promise<void> {
  const { logger: loadedLogger } = await import('./lib/errors.js');
  logger = loadedLogger;
}

async function configureTelemetry(): Promise<() => void> {
  const { config } = await import('./config/env.js');
  if (!config.DEBUG) return () => {};

  const telemetry = await import('./lib/telemetry.js');
  const stopEventLoop = telemetry.startEventLoopProbe();
  const unsubscribeLlm = telemetry.subscribeLlmRequests((event) => {
    logger.debug({ event }, 'LLM request');
  });
  const unsubscribeLoop = telemetry.subscribeEventLoopStats((stats) => {
    logger.debug({ stats }, 'Event loop health');
  });

  return () => {
    unsubscribeLlm();
    unsubscribeLoop();
    stopEventLoop();
  };
}

async function main(): Promise<void> {
  const cli = parseCli();
  applyEnvOverrides(cli);

  if (cli.help) {
    printHelp();
    return;
  }

  if (cli.version) {
    const { SERVER_NAME, SERVER_VERSION } =
      await import('./config/constants.js');
    console.log(`${SERVER_NAME} v${SERVER_VERSION}`);
    return;
  }

  await initLogger();

  const cleanupTelemetry = await configureTelemetry();
  process.once('exit', () => {
    cleanupTelemetry();
  });

  const { getLLMClient } = await import('./lib/llm-client.js');
  const { startServer } = await import('./server.js');

  await getLLMClient();
  server = await startServer();
}

main().catch((err: unknown) => {
  void shutdown('startup', err);
});
