/**
 * Fulfillment Tracking Sync Job
 *
 * Runs every 10 minutes to sync tracking status for all active shipments
 * from Shiprocket API. Polls Shiprocket tracking endpoint for latest status.
 *
 * Trigger: Cron job (every 10 minutes)
 * Use: scheduleTrackingSync() in server startup
 */

import cron, { ScheduledTask } from 'node-cron';
import { TrackingSchedulerService } from '../../../modules/shipments/services/tracking-scheduler.service';
import { shipmentLogger } from '../../../utils/shipment-logger';

const trackingScheduler = new TrackingSchedulerService();

let job: ScheduledTask | null = null;

export const scheduleTrackingSync = (): void => {
  // Run every 10 minutes
  job = cron.schedule('*/10 * * * *', async () => {
    try {
      const startTime = Date.now();
      await trackingScheduler.fetchAndUpdateTrackingForAllOrders();
      const duration = Date.now() - startTime;

      shipmentLogger.info({
        duration: `${duration}ms`,
      }, '✅ Tracking sync job completed');
    } catch (error) {
      shipmentLogger.error({
        error: error instanceof Error ? error.message : String(error),
      }, '❌ Tracking sync job failed');
    }
  });

  shipmentLogger.info({}, '📅 Tracking sync job scheduled (every 10 minutes)');
};

export const stopTrackingSync = (): void => {
  if (job) {
    job.stop();
    shipmentLogger.info({}, 'Tracking sync job stopped');
  }
};
