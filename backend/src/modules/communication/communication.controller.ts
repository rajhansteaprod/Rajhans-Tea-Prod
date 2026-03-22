import { Request, Response } from 'express';
import { NotificationService } from './services/notification.service';
import { User } from '../auth/models/user.model';
import { sendSuccess, sendCreated, sendPaginated } from '../../utils/api-response';

const notificationService = new NotificationService();

// ─── User: Inbox ─────────────────────────────────────────────────────────────

export const getInbox = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { page, limit, unreadOnly } = req.query as Record<string, string | undefined>;
  const result = await notificationService.getInbox(userId, {
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
    unreadOnly: unreadOnly === 'true',
  });
  sendPaginated(res, result.notifications, result.meta, 'Notifications');
};

export const getUnreadCount = async (req: Request, res: Response) => {
  const count = await notificationService.getUnreadCount(req.user!.userId);
  sendSuccess(res, { count });
};

export const markRead = async (req: Request, res: Response) => {
  await notificationService.markRead(req.params['id'] as string, req.user!.userId);
  sendSuccess(res, { read: true });
};

export const markAllRead = async (req: Request, res: Response) => {
  await notificationService.markAllRead(req.user!.userId);
  sendSuccess(res, { read: true }, 'All marked as read');
};

// ─── User: Preferences ──────────────────────────────────────────────────────

export const getPreferences = async (req: Request, res: Response) => {
  const prefs = await notificationService.getPreferences(req.user!.userId);
  sendSuccess(res, prefs);
};

export const updatePreferences = async (req: Request, res: Response) => {
  const prefs = await notificationService.updatePreferences(req.user!.userId, req.body);
  sendSuccess(res, prefs, 'Preferences updated');
};

// ─── User: FCM Token ─────────────────────────────────────────────────────────

export const registerFcmToken = async (req: Request, res: Response) => {
  const { token, deviceInfo } = req.body;
  await notificationService.registerFcmToken(req.user!.userId, token, deviceInfo);
  sendSuccess(res, { registered: true });
};

export const unregisterFcmToken = async (req: Request, res: Response) => {
  await notificationService.unregisterFcmToken(req.body.token);
  sendSuccess(res, { unregistered: true });
};

// ─── Admin ───────────────────────────────────────────────────────────────────

export const adminGetStats = async (_req: Request, res: Response) => {
  const stats = await notificationService.getStats();
  sendSuccess(res, stats);
};

export const adminSendBulk = async (req: Request, res: Response) => {
  const { type, message, targetRole } = req.body;
  const filter: Record<string, unknown> = { isActive: true };
  if (targetRole) filter.role = targetRole;

  const users = await User.find(filter).select('_id').limit(10000).exec();
  const userIds = users.map((u) => u._id.toString());

  const { getNotificationQueue, NotificationJobs } = await import('./jobs/queues/notification.queue');
  await getNotificationQueue().add(
    NotificationJobs.SEND_BULK,
    { type: type || 'announcement', userIds, metadata: { message } },
    { attempts: 2 },
  );

  sendSuccess(res, { queued: userIds.length }, `Notification queued for ${userIds.length} users`);
};

export const adminListTemplates = async (_req: Request, res: Response) => {
  const templates = await notificationService.listTemplates();
  sendSuccess(res, templates);
};

export const adminCreateTemplate = async (req: Request, res: Response) => {
  const template = await notificationService.createTemplate(req.body);
  sendCreated(res, template, 'Template created');
};

export const adminUpdateTemplate = async (req: Request, res: Response) => {
  const template = await notificationService.updateTemplate(req.params['id'] as string, req.body);
  sendSuccess(res, template, 'Template updated');
};

export const adminDeleteTemplate = async (req: Request, res: Response) => {
  await notificationService.deleteTemplate(req.params['id'] as string);
  sendSuccess(res, { deleted: true });
};
