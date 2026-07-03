import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ZodError } from 'zod';
import { ApiError } from '../utils/api-error';
import { logger } from '../utils/logger';
import { config } from '../config';

export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('🚨 ERROR HANDLER CAUGHT:', {
    path: req.path,
    method: req.method,
    message: err.message,
    name: err.name,
  });
  logger.error({ err, requestId: req.requestId }, err.message);

  if (err instanceof ApiError) {
    console.error('🚨 ApiError:', {
      statusCode: err.statusCode,
      message: err.message,
    });
    return res.status(err.statusCode).json({
      success: false,
      statusCode: err.statusCode,
      message: err.message,
      errors: err.errors,
      ...(config.env === 'development' && { stack: err.stack }),
    });
  }

  if (err instanceof ZodError) {
    const errors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      statusCode: StatusCodes.BAD_REQUEST,
      message: errors.length > 0 ? `Validation failed: ${errors[0].field} — ${errors[0].message}` : 'Validation failed',
      errors,
       ...(config.env === 'development' && { stack: err.stack }),
    });
  }

  // Mongoose schema validation (e.g. enum/min violations that bypassed zod)
  if (err.name === 'ValidationError' && 'errors' in err) {
    const mongooseErrors = Object.entries((err as { errors: Record<string, { message: string }> }).errors)
      .map(([field, e]) => ({ field, message: e.message }));
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      statusCode: StatusCodes.BAD_REQUEST,
      message: mongooseErrors[0]?.message ?? 'Validation failed',
      errors: mongooseErrors,
    });
  }

  // Malformed ObjectId or type cast failure in a query
  if (err.name === 'CastError') {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      statusCode: StatusCodes.BAD_REQUEST,
      message: 'Invalid identifier format',
    });
  }

  // MongoDB duplicate key (unique index) violation
  if ((err as { code?: number }).code === 11000) {
    const keyValue = (err as { keyValue?: Record<string, unknown> }).keyValue ?? {};
    const field = Object.keys(keyValue)[0] ?? 'field';
    return res.status(StatusCodes.CONFLICT).json({
      success: false,
      statusCode: StatusCodes.CONFLICT,
      message: `A record with this ${field} already exists`,
    });
  }

  return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
    success: false,
    statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    message: 'Internal server error',
    ...(config.env === 'development' && { stack: err.stack }),
  });
};
