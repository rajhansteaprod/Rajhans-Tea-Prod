/**
 * Fulfillment Tracking Sync Job
 *
 * Runs every 5 minutes to sync tracking status for all active shipments
 * from Shiprocket API. Updates order status based on tracking updates.
 *
 * Trigger: Cron job (every 5 minutes)
 * Use: scheduleTrackingSync() in server startup
 */

import cron, { ScheduledTask } from 'node-cron';
import { OrderService } from '../services/order.service';
import { OrderRepository } from '../repositories/order.repository';
import { logger } from '../../../utils/logger';

const orderService = new OrderService();
const orderRepo = new OrderRepository();

let job: ScheduledTask | null = null;

export const scheduleTrackingSync = (): void => {
  // Run every 5 minutes
  job = cron.schedule('*/5 * * * *', async () => {
    try {
      logger.info('Starting fulfillment tracking sync job');
      const startTime = Date.now();

      // Find all active shipments (shipped, in_transit, out_for_delivery)
      const activeOrders = await orderRepo.findActiveShipments();
      logger.info({ count: activeOrders.length }, 'Found active shipments');

      let successCount = 0;
      let failureCount = 0;

      // Sync tracking for each active order
      for (const order of activeOrders) {
        try {
          const tracking = await orderService.getTracking(order._id.toString());
          logger.debug(
            { orderId: order._id, status: tracking.status },
            'Synced tracking for order'
          );
          successCount++;
        } catch (error) {
          logger.warn(
            { orderId: order._id, error: (error as Error).message },
            'Failed to sync tracking for order'
          );
          failureCount++;
        }
      }

      const duration = Date.now() - startTime;
      logger.info(
        { successCount, failureCount, duration: `${duration}ms` },
        'Fulfillment tracking sync job completed'
      );
    } catch (error) {
      logger.error({ error }, 'Fulfillment tracking sync job failed');
    }
  });

  logger.info('Fulfillment tracking sync job scheduled (every 5 minutes)');
};

export const stopTrackingSync = (): void => {
  if (job) {
    job.stop();
    logger.info('Fulfillment tracking sync job stopped');
  }
};
