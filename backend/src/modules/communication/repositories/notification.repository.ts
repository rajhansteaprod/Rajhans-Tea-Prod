import { Types } from 'mongoose';
import { Notification, INotificationDoc } from '../models/notification.model';
import { parsePagination, buildPaginationMeta } from '../../../utils/pagination';

export class NotificationRepository {
  async create(data: Partial<INotificationDoc>): Promise<INotificationDoc> {
    return Notification.create(data) as Promise<INotificationDoc>;
  }

  async findByUser(
    userId: string,
    query: { page?: number; limit?: number; unreadOnly?: boolean } = {},
  ) {
    const { page, limit, skip } = parsePagination(query);
    const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
    if (query.unreadOnly) filter.isRead = false;

    const [notifications, total] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      Notification.countDocuments(filter).exec(),
    ]);
    return { notifications, meta: buildPaginationMeta(page, limit, total) };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return Notification.countDocuments({
      userId: new Types.ObjectId(userId),
      isRead: false,
    }).exec();
  }

  async markRead(id: string, userId: string): Promise<void> {
    await Notification.findOneAndUpdate(
      { _id: id, userId: new Types.ObjectId(userId) },
      { $set: { isRead: true } },
    ).exec();
  }

  async markAllRead(userId: string): Promise<void> {
    await Notification.updateMany(
      { userId: new Types.ObjectId(userId), isRead: false },
      { $set: { isRead: true } },
    ).exec();
  }

  async getStats(): Promise<{
    totalSent: number;
    last24h: number;
    byChannel: Record<string, number>;
  }> {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [totalSent, last24h, channelAgg] = await Promise.all([
      Notification.countDocuments().exec(),
      Notification.countDocuments({ createdAt: { $gte: dayAgo } }).exec(),
      Notification.aggregate([
        { $unwind: '$channels' },
        { $group: { _id: '$channels', count: { $sum: 1 } } },
      ]).exec(),
    ]);

    const byChannel: Record<string, number> = {};
    for (const c of channelAgg) byChannel[c._id] = c.count;

    return { totalSent, last24h, byChannel };
  }
}
