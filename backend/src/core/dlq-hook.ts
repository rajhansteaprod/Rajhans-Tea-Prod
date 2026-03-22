import { Job, Worker } from 'bullmq';
import { logger } from '../utils/logger';

/**
 * Attaches a DLQ hook to a BullMQ worker.
 * When a job exhausts all retries, it logs the failure.
 *
 * Usage:
 *   const worker = new Worker('payment', processor, opts);
 *   attachDLQHook(worker, 'payment');
 */
export function attachDLQHook(worker: Worker, queueName: string): void {
  worker.on('failed', async (job: Job | undefined, err: Error) => {
    if (!job) return;

    const maxAttempts = (job.opts?.attempts as number) || 1;
    if (job.attemptsMade >= maxAttempts) {
      logger.warn(
        {
          queueName,
          jobName: job.name,
          jobId: job.id,
          attempts: job.attemptsMade,
          error: err.message,
        },
        'Job exhausted retries → DLQ',
      );
      // TODO: re-add QueueMonitorService.addToDeadLetter when distributed module is added
    }
  });
}
