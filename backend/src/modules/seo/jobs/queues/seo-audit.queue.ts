import { Queue } from 'bullmq';
import { getBullMQConnectionOpts } from '../../../../loaders/bullmq.loader';

export const SEO_AUDIT_QUEUE = 'seo-audit';
export const SEO_RUN_JOB = 'seo:run-audit';

let queue: Queue | null = null;

export const getSeoAuditQueue = (): Queue => {
  if (!queue) {
    queue = new Queue(SEO_AUDIT_QUEUE, { connection: getBullMQConnectionOpts() });
  }
  return queue;
};
