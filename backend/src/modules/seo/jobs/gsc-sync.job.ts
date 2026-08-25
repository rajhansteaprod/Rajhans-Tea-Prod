import cron from 'node-cron';
import { getGscSyncQueue, GSC_SYNC_JOB } from './queues/gsc-sync.queue';
import { gscConfig } from '../gsc.config';
import { logger } from '../../../utils/logger';

/**
 * Daily scheduled GSC sync — Phase 4a leaves this DISABLED. It is intentionally
 * NOT called from server.ts. Do not wire it in until several manual syncs (and
 * the read-only dry-run) have been validated. When enabled, it runs at 03:45
 * (after the 03:15 audit) with a deterministic per-day job id.
 */
export function scheduleGscSync(): void {
  if (!gscConfig.enabled) {
    logger.info('GSC not configured — daily sync not scheduled');
    return;
  }
  cron.schedule('45 3 * * *', async () => {
    try {
      const day = new Date().toISOString().slice(0, 10);
      await getGscSyncQueue().add(
        GSC_SYNC_JOB,
        { trigger: 'cron' },
        { jobId: `gsc-daily-${day}`, removeOnComplete: 30, removeOnFail: 30 },
      );
      logger.info({ day }, 'Daily GSC sync enqueued');
    } catch (err) {
      logger.error({ err }, 'Failed to enqueue daily GSC sync');
    }
  });
  logger.info('GSC daily sync scheduled');
}
