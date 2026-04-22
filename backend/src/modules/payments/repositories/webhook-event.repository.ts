import { BaseRepository } from '../../../core/base.repository';
import { WebhookEvent, IWebhookEventDoc } from '../models/webhook-event.model';

export class WebhookEventRepository extends BaseRepository<IWebhookEventDoc> {
  constructor() {
    super(WebhookEvent);
  }

  /**
   * Find webhook event by Razorpay event ID (idempotency check)
   */
  async findByRazorpayEventId(razorpayEventId: string): Promise<IWebhookEventDoc | null> {
    return this.findOne({ razorpayEventId });
  }

  /**
   * Find all failed webhooks that are ready for retry
   */
  async findFailedForRetry(): Promise<IWebhookEventDoc[]> {
    const now = new Date();
    return WebhookEvent.find({
      status: 'failed',
      nextRetryAt: { $lt: now },
    }).lean() as Promise<IWebhookEventDoc[]>;
  }

  /**
   * Update webhook status and retry info
   */
  async updateRetryInfo(
    webhookEventId: string,
    data: {
      status?: string;
      retryCount?: number;
      nextRetryAt?: Date | null;
      processingError?: string | null;
      processedAt?: Date | null;
    },
  ): Promise<IWebhookEventDoc | null> {
    return this.updateById(webhookEventId, data);
  }

  /**
   * Mark webhook as processed (successful)
   */
  async markAsProcessed(webhookEventId: string): Promise<IWebhookEventDoc | null> {
    return this.updateById(webhookEventId, {
      status: 'processed',
      processedAt: new Date(),
    });
  }

  /**
   * Mark webhook as dead lettered (gave up after max retries)
   */
  async markAsDeadLettered(
    webhookEventId: string,
    lastError: string,
  ): Promise<IWebhookEventDoc | null> {
    return this.updateById(webhookEventId, {
      status: 'dead_lettered',
      processingError: lastError,
    });
  }

  /**
   * Schedule webhook for retry
   */
  async scheduleRetry(
    webhookEventId: string,
    nextRetryAt: Date,
    error: string,
  ): Promise<IWebhookEventDoc | null> {
    return WebhookEvent.findByIdAndUpdate(
      webhookEventId,
      {
        status: 'failed',
        nextRetryAt,
        processingError: error,
        $inc: { retryCount: 1 },
      },
      { new: true },
    );
  }

  /**
   * Get webhook event statistics (for admin dashboard)
   */
  async getStats(): Promise<{
    total: number;
    processed: number;
    failed: number;
    deadLettered: number;
    pendingRetry: number;
  }> {
    const results = await WebhookEvent.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          processed: { $sum: { $cond: [{ $eq: ['$status', 'processed'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          deadLettered: { $sum: { $cond: [{ $eq: ['$status', 'dead_lettered'] }, 1, 0] } },
          pendingRetry: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'failed'] },
                    { $lt: ['$nextRetryAt', new Date()] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    if (results.length === 0) {
      return {
        total: 0,
        processed: 0,
        failed: 0,
        deadLettered: 0,
        pendingRetry: 0,
      };
    }

    return results[0];
  }
}
