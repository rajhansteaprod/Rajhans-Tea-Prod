import { Queue } from 'bullmq';
import { getBullMQConnectionOpts } from '../../../../loaders/bullmq.loader';

export const GSC_SYNC_QUEUE = 'gsc-sync';
export const GSC_SYNC_JOB = 'gsc:sync';

let queue: Queue | null = null;

export const getGscSyncQueue = (): Queue => {
  if (!queue) {
    queue = new Queue(GSC_SYNC_QUEUE, { connection: getBullMQConnectionOpts() });
  }
  return queue;
};
