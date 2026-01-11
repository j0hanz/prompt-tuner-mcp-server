import { parseArgs } from 'node:util';

import { writeCliOutput } from './output.js';

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

const LOG_FORMATS = new Set(['text', 'json']);
const LLM_PROVIDERS = new Set(['openai', 'anthropic', 'google']);

export interface CliValues {
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

type ParsedCliValues = Record<
  keyof typeof CLI_OPTIONS,
  string | boolean | undefined
>;

const BOOLEAN_KEYS = ['debug', 'includeErrorContext'] as const;
const STRING_KEYS = [
  'logFormat',
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
  applyEnumEnv('LOG_FORMAT', values.logFormat, LOG_FORMATS, '--log-format');
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
