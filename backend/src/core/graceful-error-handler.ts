import { logger } from '../utils/logger';

/**
 * Registers global error handlers for uncaught exceptions and unhandled rejections.
 * Call once on server startup BEFORE app.listen().
 */
export function registerGlobalErrorHandlers(): void {
  // Fatal: unexpected synchronous throw — log + exit (PM2/Docker restarts)
  process.on('uncaughtException', (err: Error) => {
    logger.fatal({ err: err.message, stack: err.stack }, 'UNCAUGHT EXCEPTION — shutting down');
    // Grace period: let in-flight requests finish
    setTimeout(() => process.exit(1), 3000);
  });

  // Non-fatal: unhandled async promise rejection — log but don't crash
  process.on('unhandledRejection', (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    logger.error({ err: message, stack }, 'UNHANDLED PROMISE REJECTION');
    // Don't exit — most rejections are recoverable (network timeouts, etc.)
  });

  // Memory warning
  const HEAP_LIMIT_MB = 450; // warn at 450MB
  setInterval(() => {
    const heapUsedMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    if (heapUsedMB > HEAP_LIMIT_MB) {
      logger.warn({ heapUsedMB }, 'HIGH MEMORY USAGE — potential leak');
    }
  }, 60000); // check every minute

  logger.info('Global error handlers registered');
}
