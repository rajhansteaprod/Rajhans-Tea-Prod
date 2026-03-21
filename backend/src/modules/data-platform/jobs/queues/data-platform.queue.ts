import { Queue } from 'bullmq';
import { getBullMQConnectionOpts } from '../../../../loaders/bullmq.loader';

export const DataPlatformJobs = {
  BACKUP: 'data-platform:backup',
  ARCHIVE: 'data-platform:archive',
} as const;

let dataPlatformQueue: Queue | null = null;

export const getDataPlatformQueue = (): Queue => {
  if (!dataPlatformQueue) {
    dataPlatformQueue = new Queue('data-platform', { connection: getBullMQConnectionOpts() });
  }
  return dataPlatformQueue;
};
