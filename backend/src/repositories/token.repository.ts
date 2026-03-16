import { BaseRepository } from './base.repository';
import { Token, ITokenDoc } from '../models/token.model';

export class TokenRepository extends BaseRepository<ITokenDoc> {
  constructor() {
    super(Token);
  }

  async findByToken(token: string): Promise<ITokenDoc | null> {
    return this.model.findOne({ token, expiresAt: { $gt: new Date() } }).exec();
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.model.deleteMany({ user: userId }).exec();
  }

  async deleteByToken(token: string): Promise<void> {
    await this.model.deleteOne({ token }).exec();
  }
}
