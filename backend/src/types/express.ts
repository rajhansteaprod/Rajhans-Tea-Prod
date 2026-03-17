import { ITokenPayload } from './auth.types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: ITokenPayload;
      requestId?: string;
    }
  }
}

export {};
