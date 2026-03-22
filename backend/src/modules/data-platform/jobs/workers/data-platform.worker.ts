import { Worker, Job } from 'bullmq';
import { getBullMQConnectionOpts } from '../../../../loaders/bullmq.loader';
import { BackupService } from '../../services/backup.service';
import { ArchiveService } from '../../services/archive.service';
import { logger } from '../../../../utils/logger';

const backupService = new BackupService();
const archiveService = new ArchiveService();

let worker: Worker | null = null;

export const startDataPlatformWorker = (): void => {
  worker = new Worker(
    'data-platform',
    async (job: Job) => {
      if (job.name === 'data-platform:backup') {
        logger.info({ jobId: job.id }, 'Running scheduled backup');
        await backupService.runBackup('scheduled');
      }

      if (job.name === 'data-platform:archive') {
        logger.info({ jobId: job.id }, 'Running data archival');
        const [orders, audit, search] = await Promise.all([
          archiveService.archiveOldOrders(365),
          archiveService.archiveOldAuditLogs(90),
          archiveService.archiveOldSearchAnalytics(90),
        ]);
        logger.info(
          { orders: orders.archived, audit: audit.archived, search: search.archived },
          'Archival complete',
        );
      }
    },
    {
      connection: getBullMQConnectionOpts(),
      concurrency: 1, // serialize — only one backup at a time
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Data platform job failed');
  });
};

export const closeDataPlatformWorker = async (): Promise<void> => {
  if (worker) await worker.close();
};
