import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UnauthorizedError, ForbiddenError } from '../utils/api-error';
import { ITokenPayload } from '../types/auth.types';
import { User } from '../modules/auth/models/user.model';

export const authenticate = async (req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Access token required');
  }

  const token = authHeader.split(' ')[1];

  let payload: ITokenPayload;
  try {
    payload = jwt.verify(token, config.jwt.accessSecret) as ITokenPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }

  // ABAC: check banned attribute on every authenticated request
  const user = await User.findById(payload.userId, 'isBanned').lean();
  if (user?.isBanned) {
    throw new ForbiddenError('Your account has been suspended. Contact support for assistance.');
  }

  req.user = payload;
  next();
};
