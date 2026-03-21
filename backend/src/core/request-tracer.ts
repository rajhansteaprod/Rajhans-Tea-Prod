import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';

/**
 * Request tracer using AsyncLocalStorage.
 * Propagates a traceId through the entire request lifecycle including BullMQ jobs.
 *
 * Usage in middleware:
 *   requestTracer.run(traceId, () => next());
 *
 * Usage anywhere in code:
 *   const traceId = requestTracer.getTraceId();
 *
 * Usage in BullMQ job data:
 *   queue.add(jobName, { ...data, _traceId: requestTracer.getTraceId() });
 *   // In worker: requestTracer.run(job.data._traceId, () => processJob());
 */

const store = new AsyncLocalStorage<{ traceId: string }>();

export const requestTracer = {
  /**
   * Run a function within a trace context.
   */
  run<T>(traceId: string, fn: () => T): T {
    return store.run({ traceId }, fn);
  },

  /**
   * Get current trace ID (or generate one if not in context).
   */
  getTraceId(): string {
    return store.getStore()?.traceId || crypto.randomUUID().slice(0, 8);
  },

  /**
   * Generate a new trace ID.
   */
  generateTraceId(): string {
    return crypto.randomUUID().slice(0, 16);
  },
};
