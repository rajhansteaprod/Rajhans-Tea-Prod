import { StatusCodes } from 'http-status-codes';

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errors?: { field: string; message: string }[];

  constructor(statusCode: number, message: string, errors?: { field: string; message: string }[]) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export class BadRequestError extends ApiError {
  constructor(message = 'Bad request', errors?: { field: string; message: string }[]) {
    super(StatusCodes.BAD_REQUEST, message, errors);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(StatusCodes.UNAUTHORIZED, message);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(StatusCodes.FORBIDDEN, message);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Resource not found') {
    super(StatusCodes.NOT_FOUND, message);
  }
}

export class ConflictError extends ApiError {
  constructor(message = 'Resource already exists') {
    super(StatusCodes.CONFLICT, message);
  }
}

export class TooManyRequestsError extends ApiError {
  constructor(message = 'Too many requests') {
    super(StatusCodes.TOO_MANY_REQUESTS, message);
  }
}
