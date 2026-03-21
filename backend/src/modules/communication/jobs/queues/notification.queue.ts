import { Queue } from 'bullmq';
import { getBullMQConnectionOpts } from '../../../../loaders/bullmq.loader';

export const NotificationJobs = {
  SEND: 'notification:send',
  SEND_BULK: 'notification:send-bulk',
} as const;

let notificationQueue: Queue | null = null;

export const getNotificationQueue = (): Queue => {
  if (!notificationQueue) {
    notificationQueue = new Queue('notifications', { connection: getBullMQConnectionOpts() });
  }
  return notificationQueue;
};
