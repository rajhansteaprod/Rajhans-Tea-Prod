import { Cart } from '../models/cart.model';
import { CheckoutSession } from '../models/checkout-session.model';

export class CartCleanupService {
  /**
   * Cleanup temporary carts and abandoned checkout sessions
   * Should run periodically (e.g., hourly via cron job)
   */
  async cleanup(): Promise<{ deletedCarts: number; abandonedSessions: number }> {
    const now = new Date();

    // 1. Delete temporary carts older than 24 hours
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const deleteCartResult = await Cart.deleteMany({
      status: 'temporary',
      createdAt: { $lt: twentyFourHoursAgo },
    });

    // 2. Mark checkout sessions as abandoned if > 30 min without payment
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const abandonSessionResult = await CheckoutSession.updateMany(
      {
        status: 'active',
        startedAt: { $lt: thirtyMinutesAgo },
      },
      { status: 'abandoned' }
    );

    console.log(`✅ Cart Cleanup: Deleted ${deleteCartResult.deletedCount} temporary carts, abandoned ${abandonSessionResult.modifiedCount} sessions`);

    return {
      deletedCarts: deleteCartResult.deletedCount,
      abandonedSessions: abandonSessionResult.modifiedCount,
    };
  }
}
