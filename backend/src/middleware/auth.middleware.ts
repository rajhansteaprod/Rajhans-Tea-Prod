import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UnauthorizedError } from '../utils/api-error';
import { ITokenPayload } from '../types/auth.types';

export const authenticate = (req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Access token required');
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, config.jwt.accessSecret) as ITokenPayload;
    req.user = payload;
    next();
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }
};
