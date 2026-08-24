import { Worker, Job } from 'bullmq';
import { getBullMQConnectionOpts } from '../../../../loaders/bullmq.loader';
import { SEO_AUDIT_QUEUE, SEO_RUN_JOB } from '../queues/seo-audit.queue';
import { runAudit } from '../../services/audit.service';
import { RunScope, RunTrigger } from '../../seo.types';
import { logger } from '../../../../utils/logger';

let worker: Worker | null = null;

/**
 * Executes SEO audit runs off the request thread. Concurrency 1 — only one audit
 * runs at a time (never hammer production, and keep runs comparable). The audit
 * itself is fully read-only.
 */
export const startSeoAuditWorker = (): void => {
  worker = new Worker(
    SEO_AUDIT_QUEUE,
    async (job: Job) => {
      if (job.name !== SEO_RUN_JOB) return;
      const { trigger, scope } = job.data as { trigger: RunTrigger; scope: RunScope };
      logger.info({ jobId: job.id, trigger, scope }, 'SEO audit job received');
      const run = await runAudit(trigger, scope);
      return { runId: run._id.toString(), status: run.status };
    },
    { connection: getBullMQConnectionOpts(), concurrency: 1 },
  );

  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'SEO audit job failed'));
};

export const closeSeoAuditWorker = async (): Promise<void> => {
  if (worker) await worker.close();
};
