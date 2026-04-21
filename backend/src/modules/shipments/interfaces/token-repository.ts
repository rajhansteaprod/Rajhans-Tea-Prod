import { AuthenticateResponse } from './types';

export interface ITokenRepository {
  getValidToken(): Promise<AuthenticateResponse | null>;
  saveToken(tokenData: AuthenticateResponse): Promise<void>;
  clearTokens(): Promise<void>;
}
