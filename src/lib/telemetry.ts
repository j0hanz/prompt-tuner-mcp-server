import diagnosticsChannel from 'node:diagnostics_channel';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

import type { ErrorCodeType, LLMProvider } from '../types.js';

const LLM_REQUEST_CHANNEL = 'prompt-tuner:llm.request';
const EVENT_LOOP_CHANNEL = 'prompt-tuner:event-loop';

export interface LlmRequestEvent {
  provider: LLMProvider;
  model: string;
  attempts: number;
  durationMs: number;
  ok: boolean;
  errorCode?: ErrorCodeType;
  status?: number;
}

export interface EventLoopStatsEvent {
  utilization: number;
  delayMeanMs: number;
  delayP99Ms: number;
}

const llmRequestChannel = diagnosticsChannel.channel(LLM_REQUEST_CHANNEL);
const eventLoopChannel = diagnosticsChannel.channel(EVENT_LOOP_CHANNEL);

function safePublish(
  channel: diagnosticsChannel.Channel,
  message: unknown
): void {
  if (!channel.hasSubscribers) return;
  try {
    channel.publish(message);
  } catch {
    // Avoid crashing on subscriber errors.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const LLM_REQUEST_FIELD_TYPES = {
  provider: 'string',
  model: 'string',
  attempts: 'number',
  durationMs: 'number',
  ok: 'boolean',
} as const;

const EVENT_LOOP_FIELD_TYPES = {
  utilization: 'number',
  delayMeanMs: 'number',
  delayP99Ms: 'number',
} as const;

type PrimitiveType = 'string' | 'number' | 'boolean';

function hasFieldTypes(
  value: Record<string, unknown>,
  fields: Record<string, PrimitiveType>
): boolean {
  return Object.entries(fields).every(
    ([key, type]) => typeof value[key] === type
  );
}

function isLlmRequestEvent(message: unknown): message is LlmRequestEvent {
  return isRecord(message) && hasFieldTypes(message, LLM_REQUEST_FIELD_TYPES);
}

function isEventLoopStatsEvent(
  message: unknown
): message is EventLoopStatsEvent {
  return isRecord(message) && hasFieldTypes(message, EVENT_LOOP_FIELD_TYPES);
}

export function publishLlmRequest(event: LlmRequestEvent): void {
  safePublish(llmRequestChannel, event);
}

function publishEventLoopStats(event: EventLoopStatsEvent): void {
  safePublish(eventLoopChannel, event);
}

export function subscribeLlmRequests(
  handler: (event: LlmRequestEvent) => void
): () => void {
  const wrapped = (message: unknown): void => {
    if (!isLlmRequestEvent(message)) return;
    handler(message);
  };
  diagnosticsChannel.subscribe(LLM_REQUEST_CHANNEL, wrapped);
  return () => {
    diagnosticsChannel.unsubscribe(LLM_REQUEST_CHANNEL, wrapped);
  };
}

export function subscribeEventLoopStats(
  handler: (event: EventLoopStatsEvent) => void
): () => void {
  const wrapped = (message: unknown): void => {
    if (!isEventLoopStatsEvent(message)) return;
    handler(message);
  };
  diagnosticsChannel.subscribe(EVENT_LOOP_CHANNEL, wrapped);
  return () => {
    diagnosticsChannel.unsubscribe(EVENT_LOOP_CHANNEL, wrapped);
  };
}

export interface EventLoopProbeOptions {
  intervalMs?: number;
  resolutionMs?: number;
}

export function startEventLoopProbe(
  options: EventLoopProbeOptions = {}
): () => void {
  const intervalMs = options.intervalMs ?? 5000;
  const resolutionMs = options.resolutionMs ?? 20;
  const histogram = monitorEventLoopDelay({ resolution: resolutionMs });
  histogram.enable();

  let previous = performance.eventLoopUtilization();

  const timer = setInterval(() => {
    const current = performance.eventLoopUtilization(previous);
    previous = current;

    const meanMs = histogram.mean / 1e6;
    const p99Ms = histogram.percentile(99) / 1e6;

    publishEventLoopStats({
      utilization: current.utilization,
      delayMeanMs: meanMs,
      delayP99Ms: p99Ms,
    });

    histogram.reset();
  }, intervalMs);

  timer.unref();

  return () => {
    clearInterval(timer);
    histogram.disable();
  };
}
