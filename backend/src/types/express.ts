import { ITokenPayload } from './auth.types';

declare global {
  namespace Express {
    interface Request {
      user?: ITokenPayload;
      requestId?: string;
    }
  }
}

export {};
