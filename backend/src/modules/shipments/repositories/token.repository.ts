import { ITokenRepository } from '../interfaces/token-repository';
import { AuthenticateResponse } from '../interfaces/types';
import { ShiprocketToken } from '../models/shiprocket-token.model';
import { logger } from '../../../utils/logger';

export class TokenRepository implements ITokenRepository {
  async getValidToken(): Promise<AuthenticateResponse | null> {
    try {
      const tokenDoc = await ShiprocketToken.findOne({
        expiresAt: { $gt: new Date() },
      }).sort({ createdAt: -1 });

      if (!tokenDoc) {
        return null;
      }

      logger.info('Valid token retrieved from database');
      return {
        token: tokenDoc.token,
        expiresAt: tokenDoc.expiresAt,
      };
    } catch (error: any) {
      logger.error(`Error retrieving token from database: ${error.message}`);
      return null;
    }
  }

  async saveToken(tokenData: AuthenticateResponse): Promise<void> {
    try {
      await ShiprocketToken.deleteMany({});

      await ShiprocketToken.create({
        token: tokenData.token,
        expiresAt: tokenData.expiresAt,
      });

      logger.info('Token saved to database');
    } catch (error: any) {
      logger.error(`Error saving token to database: ${error.message}`);
      throw error;
    }
  }

  async clearTokens(): Promise<void> {
    try {
      await ShiprocketToken.deleteMany({});
      logger.info('All tokens cleared from database');
    } catch (error: any) {
      logger.error(`Error clearing tokens: ${error.message}`);
      throw error;
    }
  }
}
