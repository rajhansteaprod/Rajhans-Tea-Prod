import pinoHttp from 'pino-http';
import { logger } from '../utils/logger';

export const requestLoggerMiddleware = pinoHttp({
  logger,
  customProps: (req) => ({
    requestId: (req as unknown as { requestId?: string }).requestId,
  }),
  customLogLevel: (_req, res) => {
    if (res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  customErrorMessage: (req, res) => {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
});
