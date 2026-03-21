import { Worker, Job } from 'bullmq';
import { getBullMQConnectionOpts } from '../../../../loaders/bullmq.loader';
import { NotificationService } from '../../services/notification.service';
import { logger } from '../../../../utils/logger';

const notificationService = new NotificationService();

let worker: Worker | null = null;

export const startNotificationWorker = (): void => {
  worker = new Worker(
    'notifications',
    async (job: Job) => {
      if (job.name === 'notification:send') {
        const { type, userId, metadata } = job.data as {
          type: string; userId: string; metadata: Record<string, unknown>;
        };
        logger.info({ type, userId, jobId: job.id }, 'Sending notification');
        await notificationService.dispatch(type as any, userId, metadata);
      }

      if (job.name === 'notification:send-bulk') {
        const { type, userIds, metadata } = job.data as {
          type: string; userIds: string[]; metadata: Record<string, unknown>;
        };
        logger.info({ type, count: userIds.length, jobId: job.id }, 'Sending bulk notification');
        await notificationService.dispatchBulk(type as any, userIds, metadata);
      }
    },
    {
      connection: getBullMQConnectionOpts(),
      concurrency: 5,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Notification job failed');
  });
};

export const closeNotificationWorker = async (): Promise<void> => {
  if (worker) await worker.close();
};
