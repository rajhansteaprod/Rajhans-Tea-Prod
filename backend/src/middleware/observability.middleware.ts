import { Request, Response, NextFunction } from 'express';
import { requestTracer } from '../core/request-tracer';
import { logger } from '../utils/logger';

/**
 * Observability middleware — wraps requests in trace context and logs latency.
 * Place after request-id middleware but before routes.
 */
export function observabilityMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Wrap request in trace context
  const traceId =
    (req.headers['x-trace-id'] as string) || req.requestId || requestTracer.generateTraceId();
  res.setHeader('X-Trace-ID', traceId);

  // Log latency on response finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.debug(
      { method: req.method, path: req.path, statusCode: res.statusCode, duration },
      'Request completed',
    );
    // TODO: re-add metricsCollector when observability module is added
  });

  // Run within trace context
  requestTracer.run(traceId, () => next());
}
