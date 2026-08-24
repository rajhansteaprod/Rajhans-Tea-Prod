import cron from 'node-cron';
import { getSeoAuditQueue, SEO_RUN_JOB } from './queues/seo-audit.queue';
import { logger } from '../../../utils/logger';

/**
 * Daily scheduled audit — Phase 2a leaves this DISABLED. It is intentionally NOT
 * called from server.ts. Do not wire it in until several manual audits have been
 * validated. When enabled, it enqueues a run (the worker executes it), using a
 * deterministic per-day job id so overlapping schedules can't double-run.
 */
export function scheduleSeoAudit(): void {
  // 03:15 daily, low-traffic window.
  cron.schedule('15 3 * * *', async () => {
    try {
      const day = new Date().toISOString().slice(0, 10);
      await getSeoAuditQueue().add(
        SEO_RUN_JOB,
        { trigger: 'cron', scope: 'daily' },
        { jobId: `seo-daily-${day}`, removeOnComplete: 50, removeOnFail: 50 },
      );
      logger.info({ day }, 'Daily SEO audit enqueued');
    } catch (err) {
      logger.error({ err }, 'Failed to enqueue daily SEO audit');
    }
  });
  logger.info('SEO daily audit scheduled');
}
