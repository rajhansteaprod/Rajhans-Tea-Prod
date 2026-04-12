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
      message: 'Validation failed',
      errors,
    });
  }

  return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
    success: false,
    statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    message: 'Internal server error',
    ...(config.env === 'development' && { stack: err.stack }),
  });
};
