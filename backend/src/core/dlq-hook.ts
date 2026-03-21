import { Job, Worker } from 'bullmq';
import { QueueMonitorService } from '../modules/distributed/services/queue-monitor.service';
import { logger } from '../utils/logger';

const monitorService = new QueueMonitorService();

/**
 * Attaches a DLQ hook to a BullMQ worker.
 * When a job exhausts all retries, it gets written to the DeadLetter collection.
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
        { queueName, jobName: job.name, jobId: job.id, attempts: job.attemptsMade, error: err.message },
        'Job exhausted retries → writing to DLQ',
      );

      try {
        await monitorService.addToDeadLetter({
          queueName,
          jobName: job.name,
          jobData: job.data as Record<string, unknown>,
          failedReason: err.message,
          attemptsMade: job.attemptsMade,
          originalJobId: job.id || '',
        });
      } catch (dlqErr: any) {
        logger.error({ error: dlqErr.message }, 'Failed to write to DLQ');
      }
    }
  });
}
