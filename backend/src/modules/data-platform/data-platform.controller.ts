import { Request, Response } from 'express';
import { BackupService } from './services/backup.service';
import { ArchiveService } from './services/archive.service';
import { getDataPlatformQueue, DataPlatformJobs } from './jobs/queues/data-platform.queue';
import { sendSuccess } from '../../utils/api-response';

const backupService = new BackupService();
const archiveService = new ArchiveService();

export const getDataPlatformDashboard = async (_req: Request, res: Response) => {
  const [backupStats, archiveStats, history] = await Promise.all([
    backupService.getStats(),
    archiveService.getArchiveStats(),
    backupService.getHistory(10),
  ]);
  sendSuccess(res, { backupStats, archiveStats, backupHistory: history });
};

export const triggerBackup = async (req: Request, res: Response) => {
  const recordId = await backupService.runBackup('manual', req.user!.userId);
  sendSuccess(res, { backupId: recordId }, 'Backup started');
};

export const triggerArchive = async (_req: Request, res: Response) => {
  const [orders, audit, search] = await Promise.all([
    archiveService.archiveOldOrders(365),
    archiveService.archiveOldAuditLogs(90),
    archiveService.archiveOldSearchAnalytics(90),
  ]);
  sendSuccess(res, { orders, audit, search }, 'Archival complete');
};

export const scheduleBackup = async (_req: Request, res: Response) => {
  // Schedule daily backup at 3am
  await getDataPlatformQueue().add(
    DataPlatformJobs.BACKUP,
    {},
    { repeat: { pattern: '0 3 * * *' }, jobId: 'daily-backup' },
  );
  sendSuccess(res, { scheduled: true }, 'Daily backup scheduled at 3am');
};
