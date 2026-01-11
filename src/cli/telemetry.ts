import { getLogger } from './logger.js';

export async function configureTelemetry(): Promise<() => void> {
  const { config } = await import('../config/env.js');
  if (!config.DEBUG) return () => {};

  const logger = getLogger();
  const telemetry = await import('../lib/telemetry.js');
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
