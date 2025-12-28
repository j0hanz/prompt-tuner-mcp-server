import { performance } from 'node:perf_hooks';

import { ErrorCode } from '../src/lib/errors.js';
import { parseJsonFromLlmResponse } from '../src/lib/llm-json.js';

type BenchResult = {
  label: string;
  iterations: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  heapUsedMb: number;
};

const RAW_JSON = '{"ok":true,"count":2}';
const CODE_BLOCK_JSON = '```json\n{"ok":true,"count":2}\n```';
const EMBEDDED_JSON =
  'Result: {"ok":true,"text":"{value}","items":[{"a":1},{"a":2}]} done';

const ITERATIONS = 15000;
const WARMUP = 1500;

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const index = Math.floor((values.length - 1) * p);
  return values[index] ?? 0;
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function runBench(label: string, payload: string): BenchResult {
  if (global.gc) global.gc();

  for (let i = 0; i < WARMUP; i += 1) {
    parseJsonFromLlmResponse(
      payload,
      (value) => value as { ok: boolean; count?: number },
      { errorCode: ErrorCode.E_INVALID_INPUT }
    );
  }

  const times: number[] = new Array(ITERATIONS);
  const startMem = process.memoryUsage().heapUsed;

  for (let i = 0; i < ITERATIONS; i += 1) {
    const start = performance.now();
    parseJsonFromLlmResponse(
      payload,
      (value) => value as { ok: boolean; count?: number },
      { errorCode: ErrorCode.E_INVALID_INPUT }
    );
    times[i] = performance.now() - start;
  }

  if (global.gc) global.gc();
  const endMem = process.memoryUsage().heapUsed;

  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.reduce((sum, value) => sum + value, 0) / times.length;
  const heapUsedMb = endMem / 1024 / 1024;

  return {
    label,
    iterations: ITERATIONS,
    meanMs: round(mean),
    p50Ms: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    minMs: round(sorted[0] ?? 0),
    maxMs: round(sorted[sorted.length - 1] ?? 0),
    heapUsedMb: round(heapUsedMb, 2),
  };
}

const results: BenchResult[] = [
  runBench('parse:raw', RAW_JSON),
  runBench('parse:codeblock', CODE_BLOCK_JSON),
  runBench('parse:embedded', EMBEDDED_JSON),
];

console.log(
  JSON.stringify(
    {
      node: process.version,
      iterations: ITERATIONS,
      warmup: WARMUP,
      results,
    },
    null,
    2
  )
);
