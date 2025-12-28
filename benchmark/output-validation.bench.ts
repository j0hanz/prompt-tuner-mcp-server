import { performance } from 'node:perf_hooks';

import {
  normalizePromptText,
  validateTechniqueOutput,
} from '../src/lib/output-validation.js';

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

const SAMPLE_NORMALIZE = [
  '```text\nHello\n```',
  'Refined Prompt:\n```text\nHello\n```',
  'Optimized Prompt:\nHello',
  'Hello world',
];

const STRUCTURED_OUTPUT = '## Title\n- Item\n';
const ROLE_OUTPUT = 'You are a helpful assistant.\nReturn a JSON array.';

const ITERATIONS = 20000;
const WARMUP = 2000;

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const index = Math.floor((values.length - 1) * p);
  return values[index] ?? 0;
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function runBench(label: string, fn: () => void): BenchResult {
  if (global.gc) global.gc();

  for (let i = 0; i < WARMUP; i += 1) {
    fn();
  }

  const times: number[] = new Array(ITERATIONS);
  const startMem = process.memoryUsage().heapUsed;

  for (let i = 0; i < ITERATIONS; i += 1) {
    const start = performance.now();
    fn();
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

let normalizeIndex = 0;
function nextNormalizeInput(): string {
  const value = SAMPLE_NORMALIZE[normalizeIndex % SAMPLE_NORMALIZE.length];
  normalizeIndex += 1;
  return value ?? '';
}

const results: BenchResult[] = [
  runBench('normalizePromptText', () => {
    normalizePromptText(nextNormalizeInput());
  }),
  runBench('validateTechniqueOutput:structured', () => {
    validateTechniqueOutput(STRUCTURED_OUTPUT, 'structured', 'gpt');
  }),
  runBench('validateTechniqueOutput:roleBased', () => {
    validateTechniqueOutput(ROLE_OUTPUT, 'roleBased', 'gpt');
  }),
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
