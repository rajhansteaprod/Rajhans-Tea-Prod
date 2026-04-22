import cron from 'node-cron';
import { PaymentService } from '../services/payment.service';

const paymentService = new PaymentService();

/**
 * Schedule webhook retry job
 * Runs every minute
 * Finds failed webhooks ready for retry (nextRetryAt <= now)
 * Re-enqueues them to the webhook queue with exponential backoff
 */
export function scheduleWebhookRetry() {
  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      console.log('♻️  Checking for webhooks ready for retry...');
      const result = await paymentService.processFailedWebhooksForRetry();

      if (result.requeued > 0 || result.failed > 0) {
        console.log(
          `✅ Webhook retry job completed: ${result.requeued} requeued, ${result.failed} failed`,
        );
      }
    } catch (error) {
      console.error('❌ Webhook retry job failed:', (error as Error).message);
    }
  });

  console.log('📅 Webhook retry job scheduled (runs every minute)');
}
