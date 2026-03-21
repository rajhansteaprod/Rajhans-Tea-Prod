import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

/**
 * Centralized event bus — decouples modules from each other's queues.
 *
 * Usage:
 *   eventBus.emit('payment.captured', { paymentId, userId, amount });
 *   eventBus.on('payment.captured', async (data) => { ... });
 *
 * Future: swap EventEmitter with Redis pub/sub or RabbitMQ without changing emitters.
 */
class AppEventBus extends EventEmitter {
  emitEvent(event: string, data: Record<string, unknown>): void {
    logger.debug({ event, data }, 'Event emitted');
    this.emit(event, data);
  }

  onEvent(event: string, handler: (data: Record<string, unknown>) => Promise<void> | void): void {
    this.on(event, async (data) => {
      try {
        await handler(data);
      } catch (err: any) {
        logger.error({ event, error: err.message }, 'Event handler failed');
      }
    });
    logger.info({ event }, 'Event handler registered');
  }
}

export const eventBus = new AppEventBus();
eventBus.setMaxListeners(50);

// ─── Event Type Constants ────────────────────────────────────────────────────

export const Events = {
  // Payment
  PAYMENT_CAPTURED: 'payment.captured',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_REFUNDED: 'payment.refunded',

  // Order
  ORDER_CREATED: 'order.created',
  ORDER_SHIPPED: 'order.shipped',
  ORDER_DELIVERED: 'order.delivered',
  ORDER_CANCELLED: 'order.cancelled',

  // Review
  REVIEW_SUBMITTED: 'review.submitted',
  REVIEW_APPROVED: 'review.approved',

  // User
  USER_REGISTERED: 'user.registered',
  USER_LOGIN: 'user.login',

  // Inventory
  STOCK_LOW: 'stock.low',
  STOCK_OUT: 'stock.out',
} as const;
