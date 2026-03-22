import { Types } from 'mongoose';
import { FcmToken } from '../models/fcm-token.model';

export class FcmTokenRepository {
  async register(userId: string, token: string, deviceInfo?: string): Promise<void> {
    await FcmToken.findOneAndUpdate(
      { token },
      { $set: { userId: new Types.ObjectId(userId), deviceInfo: deviceInfo || null } },
      { upsert: true },
    ).exec();
  }

  async unregister(token: string): Promise<void> {
    await FcmToken.deleteOne({ token }).exec();
  }

  async getTokensForUser(userId: string): Promise<string[]> {
    const docs = await FcmToken.find({ userId: new Types.ObjectId(userId) })
      .select('token')
      .exec();
    return docs.map((d) => d.token);
  }

  async removeStaleToken(token: string): Promise<void> {
    await FcmToken.deleteOne({ token }).exec();
  }
}
