import { Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { IPaginationMeta } from '../types/common.types';

export function sendSuccess<T>(res: Response, data: T, message = 'Success', statusCode = StatusCodes.OK) {
  return res.status(statusCode).json({
    success: true,
    statusCode,
    message,
    data,
  });
}

export function sendCreated<T>(res: Response, data: T, message = 'Created successfully') {
  return sendSuccess(res, data, message, StatusCodes.CREATED);
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  meta: IPaginationMeta,
  message = 'Success',
) {
  return res.status(StatusCodes.OK).json({
    success: true,
    statusCode: StatusCodes.OK,
    message,
    data,
    meta,
  });
}

export function sendNoContent(res: Response) {
  return res.status(StatusCodes.NO_CONTENT).send();
}
