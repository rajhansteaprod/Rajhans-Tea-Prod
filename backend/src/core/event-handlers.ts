import { eventBus, Events } from './event-bus';
import { logger } from '../utils/logger';

/**
 * Registers all cross-module event handlers.
 * Called once on server startup after loaders + workers.
 *
 * Each handler dispatches work to the appropriate BullMQ queue.
 * This decouples modules: emitters don't need to know about consumers.
 */
export function registerEventHandlers(): void {
  // ─── Payment Captured → Fulfillment + Invoice + Loyalty ──────────────
  eventBus.onEvent(Events.PAYMENT_CAPTURED, async (data) => {
    const { paymentId, userId, amount } = data;
    logger.info({ paymentId }, 'Event: payment.captured → dispatching jobs');

    // These imports are lazy to avoid circular dependencies
    const { getFulfillmentQueue, FulfillmentJobs } =
      await import('../modules/inventory/jobs/queues/fulfillment.queue');
    const { getInvoiceQueue, InvoiceJobs } =
      await import('../modules/payments/jobs/queues/invoice.queue');
    const { getPromotionsQueue, PromotionJobs } =
      await import('../modules/promotions/jobs/queues/promotions.queue');

    await getFulfillmentQueue().add(
      FulfillmentJobs.CREATE_ORDER,
      { paymentId },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
    await getInvoiceQueue().add(
      InvoiceJobs.GENERATE,
      { paymentId },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    if (userId) {
      await getPromotionsQueue().add(
        PromotionJobs.EARN_LOYALTY,
        { userId, orderTotal: amount, paymentId },
        { attempts: 3 },
      );
      await getPromotionsQueue().add(
        PromotionJobs.COMPLETE_REFERRAL,
        { refereeUserId: userId, paymentId },
        { attempts: 2 },
      );
      // TODO: re-add notification when communication module is added
    }
  });

  // ─── Order Delivered ─────────────────────────────────────────────────
  eventBus.onEvent(Events.ORDER_DELIVERED, async (data) => {
    const { userId, orderNumber } = data;
    if (userId) {
      logger.info({ userId, orderNumber }, 'Event: order.delivered');
      // TODO: re-add notification when communication module is added
    }
  });

  // ─── Order Cancelled ─────────────────────────────────────────────────
  eventBus.onEvent(Events.ORDER_CANCELLED, async (data) => {
    const { userId, orderNumber } = data;
    if (userId) {
      logger.info({ userId, orderNumber }, 'Event: order.cancelled');
      // TODO: re-add notification when communication module is added
    }
  });

  // ─── Review Approved ─────────────────────────────────────────────────
  eventBus.onEvent(Events.REVIEW_APPROVED, async (data) => {
    const { userId, productName } = data;
    if (userId) {
      logger.info({ userId, productName }, 'Event: review.approved');
      // TODO: re-add notification when communication module is added
    }
  });

  // ─── Low Stock → Admin Notification ────────────────────────────────────
  eventBus.onEvent(Events.STOCK_LOW, async (data) => {
    logger.warn({ productId: data.productId, stock: data.stock }, 'Low stock alert');
    // Future: notify admin users
  });

  logger.info('Event handlers registered');
}
