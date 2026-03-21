import { Request, Response, NextFunction } from 'express';

/**
 * Request timeout middleware.
 * Prevents long-running requests from blocking the event loop.
 * Returns 503 if request exceeds timeout.
 *
 * Usage:
 *   app.use(requestTimeout(30000));  // 30 seconds
 */
export function requestTimeout(ms = 30000) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(503).json({
          success: false,
          statusCode: 503,
          message: 'Request timeout — please try again',
        });
      }
    }, ms);

    // Clear timeout when response finishes
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));

    next();
  };
}
