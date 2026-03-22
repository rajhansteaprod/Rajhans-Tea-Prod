import crypto from 'crypto';
import { WebhookSubscription } from '../models/webhook-subscription.model';
import { logger } from '../../../utils/logger';

/**
 * Dispatches events to registered webhook URLs.
 * Signs payload with HMAC-SHA256 using subscriber's secret.
 *
 * Usage:
 *   await webhookDispatcher.dispatch('order.created', { orderId, total, ... });
 */
export class WebhookDispatcherService {
  async dispatch(event: string, payload: Record<string, unknown>): Promise<void> {
    const subscribers = await WebhookSubscription.find({
      isActive: true,
      events: event,
    }).exec();

    for (const sub of subscribers) {
      this.send(sub, event, payload).catch(() => {
        /* fire and forget */
      });
    }
  }

  private async send(
    sub: InstanceType<typeof WebhookSubscription>,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
    const signature = crypto.createHmac('sha256', sub.secret).update(body).digest('hex');

    try {
      const res = await fetch(sub.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event,
        },
        body,
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      sub.lastTriggered = new Date();
      sub.lastStatus = res.status;
      if (res.ok) {
        sub.failCount = 0;
      } else {
        sub.failCount += 1;
        logger.warn(
          { webhookId: sub._id, url: sub.url, status: res.status },
          'Webhook delivery failed',
        );
      }
      await sub.save();

      // Auto-disable after 10 consecutive failures
      if (sub.failCount >= 10) {
        sub.isActive = false;
        await sub.save();
        logger.warn({ webhookId: sub._id }, 'Webhook auto-disabled after 10 failures');
      }
    } catch (err: any) {
      sub.lastTriggered = new Date();
      sub.lastStatus = 0;
      sub.failCount += 1;
      await sub.save();
      logger.error({ webhookId: sub._id, error: err.message }, 'Webhook request failed');
    }
  }

  // ─── Integration Health ───────────────────────────────────────────────────

  async getIntegrationHealth(): Promise<
    {
      name: string;
      status: 'connected' | 'error' | 'not_configured';
      lastCheck?: string;
    }[]
  > {
    const integrations = [
      { name: 'Razorpay', envKey: 'RAZORPAY_KEY_ID' },
      { name: 'Shiprocket', envKey: 'SHIPROCKET_EMAIL' },
      { name: 'MSG91 SMS', envKey: 'MSG91_AUTH_KEY' },
      { name: 'SMTP Email', envKey: 'SMTP_HOST' },
      { name: 'Firebase', envKey: 'FIREBASE_PROJECT_ID' },
    ];

    return integrations.map((i) => ({
      name: i.name,
      status: process.env[i.envKey] ? ('connected' as const) : ('not_configured' as const),
    }));
  }
}

export const webhookDispatcher = new WebhookDispatcherService();
