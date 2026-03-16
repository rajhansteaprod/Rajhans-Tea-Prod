import { BaseRepository } from './base.repository';
import { User, IUserDoc } from '../models/user.model';

export class UserRepository extends BaseRepository<IUserDoc> {
  constructor() {
    super(User);
  }

  async findByPhone(phone: string): Promise<IUserDoc | null> {
    return this.model.findOne({ phone }).exec();
  }

  async findActiveByPhone(phone: string): Promise<IUserDoc | null> {
    return this.model.findOne({ phone, isActive: true }).exec();
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.model.findByIdAndUpdate(userId, { lastLogin: new Date() }).exec();
  }
}
