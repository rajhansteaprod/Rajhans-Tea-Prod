import { BaseRepository } from '../../../core/base.repository';
import { Token, ITokenDoc } from '../models/token.model';

export class TokenRepository extends BaseRepository<ITokenDoc> {
  constructor() {
    super(Token);
  }

  async findByToken(token: string): Promise<ITokenDoc | null> {
    return this.model.findOne({ token, expiresAt: { $gt: new Date() } }).exec();
  }

  /**
   * Return all non-expired sessions for a user, sorted by most recently used.
   * Used by the session management endpoints.
   */
  async findByUserId(userId: string): Promise<ITokenDoc[]> {
    return this.model
      .find({ user: userId, expiresAt: { $gt: new Date() } })
      .sort({ lastUsedAt: -1 })
      .exec();
  }

  async updateLastUsed(tokenId: string): Promise<void> {
    await this.model.findByIdAndUpdate(tokenId, { lastUsedAt: new Date() }).exec();
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.model.deleteMany({ user: userId }).exec();
  }

  async deleteByToken(token: string): Promise<void> {
    await this.model.deleteOne({ token }).exec();
  }
}
