import { Types } from 'mongoose';
import { StockReservation, IStockReservationDoc } from '../models/stock-reservation.model';

// Matches the price snapshot TTL — users get 45 minutes to complete payment
// while stock and prices are frozen.
const RESERVATION_TTL_MINUTES = 45;

export class StockReservationRepository {
  async reserve(
    sessionId: string,
    productId: string,
    qty: number,
    variantId?: string,
  ): Promise<IStockReservationDoc> {
    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000);

    return StockReservation.findOneAndUpdate(
      {
        sessionId,
        productId: new Types.ObjectId(productId),
        variantId: variantId ? new Types.ObjectId(variantId) : null,
      },
      { qty, expiresAt },
      { new: true, upsert: true },
    ).exec() as Promise<IStockReservationDoc>;
  }

  async releaseBySession(sessionId: string): Promise<void> {
    await StockReservation.deleteMany({ sessionId }).exec();
  }

  /**
   * Sum reserved qty for a product (or a specific variant) across all active
   * (non-expired) reservations. Optionally exclude the caller's own session.
   */
  async sumReservedQty(
    productId: string,
    excludeSessionId?: string,
    variantId?: string,
  ): Promise<number> {
    const match: Record<string, unknown> = {
      productId: new Types.ObjectId(productId),
      variantId: variantId ? new Types.ObjectId(variantId) : null,
      expiresAt: { $gt: new Date() },
    };
    if (excludeSessionId) {
      match.sessionId = { $ne: excludeSessionId };
    }

    const result = await StockReservation.aggregate<{ total: number }>([
      { $match: match },
      { $group: { _id: null, total: { $sum: '$qty' } } },
    ]).exec();

    return result[0]?.total ?? 0;
  }
}
