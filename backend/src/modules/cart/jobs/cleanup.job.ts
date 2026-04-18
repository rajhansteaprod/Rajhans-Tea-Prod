import cron from 'node-cron';
import { CartCleanupService } from '../services/cart-cleanup.service';

const cleanupService = new CartCleanupService();

/**
 * Schedule cart cleanup job
 * Runs every hour at minute 0
 * Deletes temporary carts > 24h old
 * Marks checkout sessions as abandoned if > 30min without payment
 */
export function scheduleCartCleanup() {
  // Run every hour at the top of the hour
  cron.schedule('0 * * * *', async () => {
    try {
      console.log('🧹 Running cart cleanup job...');
      const result = await cleanupService.cleanup();
      console.log(`✅ Cleanup job completed: ${result}`);
    } catch (error) {
      console.error('❌ Cart cleanup job failed:', error);
    }
  });

  console.log('📅 Cart cleanup job scheduled (runs hourly)');
}
