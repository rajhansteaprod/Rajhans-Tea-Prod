import { Queue } from 'bullmq';
import { getBullMQConnectionOpts } from '../../../../loaders/bullmq.loader';

// ─── Job Types ────────────────────────────────────────────────────────────────

export const WebhookJobs = {
  PROCESS: 'webhook:process',
} as const;

// ─── Queue Instance ───────────────────────────────────────────────────────────

let webhookQueue: Queue | null = null;

export const getWebhookQueue = (): Queue => {
  if (!webhookQueue) {
    webhookQueue = new Queue('webhook', { connection: getBullMQConnectionOpts() });
  }
  return webhookQueue;
};
