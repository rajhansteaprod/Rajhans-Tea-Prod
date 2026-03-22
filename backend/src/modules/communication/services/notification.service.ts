import { Types } from 'mongoose';
import { User } from '../../auth/models/user.model';
import { NotificationRepository } from '../repositories/notification.repository';
import { NotificationPreferenceRepository } from '../repositories/notification-preference.repository';
import { NotificationTemplateRepository } from '../repositories/notification-template.repository';
import { FcmTokenRepository } from '../repositories/fcm-token.repository';
import { getNotificationProvider } from './providers/provider.factory';
import { NotificationType } from '../models/notification.model';
import { logger } from '../../../utils/logger';

function renderTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''));
}

export class NotificationService {
  private notifRepo = new NotificationRepository();
  private prefRepo = new NotificationPreferenceRepository();
  private templateRepo = new NotificationTemplateRepository();
  private fcmTokenRepo = new FcmTokenRepository();

  // ─── Main dispatch ────────────────────────────────────────────────────────

  async dispatch(
    type: NotificationType,
    userId: string,
    metadata: Record<string, unknown> = {},
  ): Promise<string> {
    const user = await User.findById(userId).select('phone firstName lastName').exec();
    if (!user) {
      logger.warn({ userId, type }, 'Notification skipped — user not found');
      return '';
    }

    const vars = { ...metadata, firstName: user.firstName || '', phone: user.phone };

    // Get template
    const template = await this.templateRepo.findByType(type);

    // Get preferences
    const prefs = await this.prefRepo.getChannelPrefs(userId, type);

    // Check quiet hours for push/SMS
    const isQuiet = await this.prefRepo.isQuietHour(userId);

    // Determine title/body
    const title = template?.channels?.push?.title
      ? renderTemplate(template.channels.push.title, vars)
      : this.defaultTitle(type);
    const body = template?.channels?.push?.body
      ? renderTemplate(template.channels.push.body, vars)
      : this.defaultBody(type, vars);

    // Always create in-app notification
    const notif = await this.notifRepo.create({
      userId: new Types.ObjectId(userId),
      type,
      title,
      body,
      link: (metadata.link as string) || null,
      channels: [],
      metadata,
    });

    const sentChannels: string[] = [];

    // Email
    if (prefs.email && template?.channels?.email) {
      try {
        const emailProvider = getNotificationProvider('email');
        const subject = renderTemplate(template.channels.email.subject, vars);
        const html = renderTemplate(template.channels.email.htmlBody, vars);
        // Email requires an email address — for now use phone@placeholder since we don't store email
        // In production, add email field to User model
        const result = await emailProvider.send({
          to: `${user.phone}@user.rnd.com`,
          subject,
          body,
          html,
        });
        if (result.success) sentChannels.push('email');
      } catch {
        /* silent */
      }
    }

    // SMS (skip during quiet hours)
    if (prefs.sms && !isQuiet && template?.channels?.sms) {
      try {
        const smsProvider = getNotificationProvider('sms');
        const smsBody = renderTemplate(template.channels.sms.body, vars);
        const result = await smsProvider.send({ to: user.phone, body: smsBody });
        if (result.success) sentChannels.push('sms');
      } catch {
        /* silent */
      }
    }

    // Push (skip during quiet hours)
    if (prefs.push && !isQuiet) {
      try {
        const pushProvider = getNotificationProvider('push');
        const result = await pushProvider.send({
          to: userId, // PushProvider looks up FCM tokens by userId
          title,
          body,
          link: (metadata.link as string) || undefined,
        });
        if (result.success) sentChannels.push('push');
      } catch {
        /* silent */
      }
    }

    // Update notification with sent channels
    if (sentChannels.length > 0) {
      const { Notification } = await import('../models/notification.model');
      await Notification.findByIdAndUpdate(notif._id, { $set: { channels: sentChannels } }).exec();
    }

    // Real-time push via WebSocket
    const { emitToUser } = await import('../../../loaders/socket.loader');
    emitToUser(userId, 'notification', {
      _id: notif._id.toString(),
      type,
      title,
      body,
      link: (metadata.link as string) || null,
      isRead: false,
      createdAt: notif.createdAt,
    });

    return notif._id.toString();
  }

  // ─── Bulk dispatch (announcements) ────────────────────────────────────────

  async dispatchBulk(
    type: NotificationType,
    userIds: string[],
    metadata: Record<string, unknown> = {},
  ): Promise<number> {
    let sent = 0;
    for (const userId of userIds) {
      try {
        await this.dispatch(type, userId, metadata);
        sent++;
      } catch {
        /* continue */
      }
    }
    return sent;
  }

  // ─── Inbox ────────────────────────────────────────────────────────────────

  async getInbox(
    userId: string,
    query: { page?: number; limit?: number; unreadOnly?: boolean } = {},
  ) {
    return this.notifRepo.findByUser(userId, query);
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notifRepo.getUnreadCount(userId);
  }

  async markRead(notificationId: string, userId: string): Promise<void> {
    await this.notifRepo.markRead(notificationId, userId);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notifRepo.markAllRead(userId);
  }

  // ─── Preferences ──────────────────────────────────────────────────────────

  async getPreferences(userId: string) {
    return this.prefRepo.findOrCreate(userId);
  }

  async updatePreferences(userId: string, data: any) {
    return this.prefRepo.update(userId, data);
  }

  // ─── FCM Tokens ───────────────────────────────────────────────────────────

  async registerFcmToken(userId: string, token: string, deviceInfo?: string) {
    await this.fcmTokenRepo.register(userId, token, deviceInfo);
  }

  async unregisterFcmToken(token: string) {
    await this.fcmTokenRepo.unregister(token);
  }

  // ─── Templates (Admin) ────────────────────────────────────────────────────

  async listTemplates() {
    return this.templateRepo.findAll();
  }

  async createTemplate(data: any) {
    return this.templateRepo.create(data);
  }

  async updateTemplate(id: string, data: any) {
    return this.templateRepo.update(id, data);
  }

  async deleteTemplate(id: string) {
    await this.templateRepo.delete(id);
  }

  async getStats() {
    return this.notifRepo.getStats();
  }

  // ─── Defaults ─────────────────────────────────────────────────────────────

  private defaultTitle(type: string): string {
    const titles: Record<string, string> = {
      order_confirmed: 'Order Confirmed',
      order_shipped: 'Order Shipped',
      order_delivered: 'Order Delivered',
      order_cancelled: 'Order Cancelled',
      payment_captured: 'Payment Received',
      payment_refunded: 'Refund Processed',
      review_approved: 'Review Published',
      review_replied: 'Review Reply',
      loyalty_earned: 'Points Earned',
      low_stock_alert: 'Low Stock Alert',
      review_reminder: 'Review Your Purchase',
      announcement: 'Announcement',
    };
    return titles[type] || 'Notification';
  }

  private defaultBody(type: string, vars: Record<string, unknown>): string {
    const bodies: Record<string, string> = {
      order_confirmed: `Hi ${vars.firstName}, your order ${vars.orderNumber || ''} is confirmed!`,
      order_shipped: `Your order ${vars.orderNumber || ''} has been shipped.`,
      order_delivered: `Your order ${vars.orderNumber || ''} has been delivered. Enjoy!`,
      order_cancelled: `Your order ${vars.orderNumber || ''} has been cancelled.`,
      payment_captured: `Payment of ₹${vars.amount || ''} received.`,
      payment_refunded: `Refund of ₹${vars.amount || ''} processed.`,
      review_approved: `Your review is now live!`,
      review_replied: `Admin replied to your review.`,
      loyalty_earned: `You earned ${vars.points || ''} loyalty points!`,
      low_stock_alert: `Low stock alert for ${vars.productName || ''}.`,
      review_reminder: `How was your purchase? Share your experience!`,
      announcement: String(vars.message || 'New announcement from RnD'),
    };
    return bodies[type] || 'You have a new notification.';
  }
}
