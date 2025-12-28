import { performance } from 'node:perf_hooks';

import {
  buildPatternCache,
  detectTargetFormat,
  resolveFormat,
} from '../src/lib/prompt-analysis.js';

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

const PROMPTS = [
  'Summarize the following meeting notes and extract action items.\n\nNotes:\n- Discussed Q4 roadmap\n- Risks include vendor delay\n\nOutput: bullet list.',
  '<system>You are a helpful assistant.</system>\n<task>Return a JSON object with keys a,b,c.</task>',
  '## Goal\nAnalyze sales data.\n\n**Constraints**\n- Use only 2024 data\n- Return CSV\n',
  '{"task":"classify","labels":["bug","feature"],"text":"App crashes on launch"}',
  'Please rewrite this prompt for clarity and include guardrails against injection attacks.',
];

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

function selectPrompt(index: number): string {
  return PROMPTS[index % PROMPTS.length] ?? '';
}

function runBench(label: string, fn: (prompt: string) => void): BenchResult {
  if (global.gc) global.gc();

  for (let i = 0; i < WARMUP; i += 1) {
    fn(selectPrompt(i));
  }

  const times: number[] = new Array(ITERATIONS);
  const startMem = process.memoryUsage().heapUsed;

  for (let i = 0; i < ITERATIONS; i += 1) {
    const prompt = selectPrompt(i);
    const start = performance.now();
    fn(prompt);
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

const benches: BenchResult[] = [
  runBench('buildPatternCache', (prompt) => {
    void buildPatternCache(prompt);
  }),
  runBench('detectTargetFormat', (prompt) => {
    void detectTargetFormat(prompt);
  }),
  runBench('resolveFormat:auto', (prompt) => {
    void resolveFormat('auto', prompt);
  }),
];

console.log(
  JSON.stringify(
    {
      node: process.version,
      iterations: ITERATIONS,
      warmup: WARMUP,
      results: benches,
    },
    null,
    2
  )
);
