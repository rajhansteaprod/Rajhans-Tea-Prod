import { Worker, Job } from 'bullmq';
import { getBullMQConnectionOpts } from '../../../../loaders/bullmq.loader';
import { GSC_SYNC_QUEUE, GSC_SYNC_JOB } from '../queues/gsc-sync.queue';
import { runGscSync } from '../../services/gsc.opportunity.service';
import { GscSyncTrigger } from '../../gsc.types';
import { logger } from '../../../../utils/logger';

let worker: Worker | null = null;

/**
 * Executes GSC sync + opportunity generation off the request thread. Concurrency
 * 1 (single-flight — never overlap syncs). Read-only against Google; only writes
 * to the GSC metric + recommendation collections.
 */
export const startGscSyncWorker = (): void => {
  worker = new Worker(
    GSC_SYNC_QUEUE,
    async (job: Job) => {
      if (job.name !== GSC_SYNC_JOB) return;
      const { trigger } = job.data as { trigger: GscSyncTrigger };
      logger.info({ jobId: job.id, trigger }, 'GSC sync job received');
      const run = await runGscSync(trigger);
      return { runId: run._id.toString(), status: run.status };
    },
    { connection: getBullMQConnectionOpts(), concurrency: 1 },
  );
  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'GSC sync job failed'));
};

export const closeGscSyncWorker = async (): Promise<void> => {
  if (worker) await worker.close();
};
