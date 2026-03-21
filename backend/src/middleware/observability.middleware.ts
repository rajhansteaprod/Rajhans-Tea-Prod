import { Request, Response, NextFunction } from 'express';
import { metricsCollector } from '../modules/observability/services/metrics-collector';
import { requestTracer } from '../core/request-tracer';

/**
 * Observability middleware — records request metrics and wraps in trace context.
 * Place after request-id middleware but before routes.
 */
export function observabilityMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Wrap request in trace context
  const traceId = (req.headers['x-trace-id'] as string) || req.requestId || requestTracer.generateTraceId();
  res.setHeader('X-Trace-ID', traceId);

  // Record metrics on response finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    metricsCollector.recordRequest(req.method, req.path, res.statusCode, duration).catch(() => {});
  });

  // Run within trace context
  requestTracer.run(traceId, () => next());
}
