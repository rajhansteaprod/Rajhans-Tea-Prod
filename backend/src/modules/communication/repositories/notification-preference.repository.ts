import { Types } from 'mongoose';
import { NotificationPreference, INotificationPreferenceDoc, IChannelPrefs } from '../models/notification-preference.model';

const DEFAULT_PREFS: IChannelPrefs = { email: true, sms: true, push: true };

export class NotificationPreferenceRepository {
  async findOrCreate(userId: string): Promise<INotificationPreferenceDoc> {
    let prefs = await NotificationPreference.findOne({ userId: new Types.ObjectId(userId) }).exec();
    if (!prefs) {
      prefs = await NotificationPreference.create({ userId: new Types.ObjectId(userId) });
    }
    return prefs;
  }

  async getChannelPrefs(userId: string, type: string): Promise<IChannelPrefs> {
    const prefs = await this.findOrCreate(userId);
    const typePrefs = prefs.preferences.get(type);
    return typePrefs || DEFAULT_PREFS;
  }

  async update(userId: string, data: Partial<INotificationPreferenceDoc>): Promise<INotificationPreferenceDoc> {
    return NotificationPreference.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      { $set: data },
      { new: true, upsert: true },
    ).exec() as Promise<INotificationPreferenceDoc>;
  }

  async isQuietHour(userId: string): Promise<boolean> {
    const prefs = await this.findOrCreate(userId);
    if (prefs.quietHoursStart === null || prefs.quietHoursEnd === null) return false;

    const now = new Date().getHours();
    const start = prefs.quietHoursStart;
    const end = prefs.quietHoursEnd;

    if (start < end) {
      return now >= start && now < end;
    }
    // Wraps midnight: e.g., 22 to 8
    return now >= start || now < end;
  }
}
