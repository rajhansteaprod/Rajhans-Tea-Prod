import { BaseRepository } from '../../../core/base.repository';
import { PriceSnapshot, IPriceSnapshotDoc } from '../models/price-snapshot.model';

export class PriceSnapshotRepository extends BaseRepository<IPriceSnapshotDoc> {
  constructor() {
    super(PriceSnapshot);
  }

  /**
   * Find active snapshot by session ID
   */
  async findActiveBySession(sessionId: string): Promise<IPriceSnapshotDoc | null> {
    return this.findOne({ sessionId, status: 'active' });
  }

  /**
   * Invalidate all active snapshots for a session (replace with new one)
   */
  async invalidatePreviousActive(sessionId: string): Promise<void> {
    await PriceSnapshot.updateMany(
      { sessionId, status: 'active' },
      { $set: { status: 'expired' } },
    );
  }

  /**
   * Mark snapshot as used by a payment
   */
  async markAsUsed(snapshotId: string, paymentId: string): Promise<IPriceSnapshotDoc | null> {
    return this.updateById(snapshotId, {
      status: 'used',
      usedByPaymentId: paymentId,
    });
  }

  /**
   * Verify snapshot is still active and not expired
   */
  async verifyActive(snapshotId: string): Promise<{ valid: boolean; snapshot?: IPriceSnapshotDoc; error?: string }> {
    const snapshot = await this.findById(snapshotId);

    if (!snapshot) {
      return { valid: false, error: 'Price snapshot not found' };
    }

    if (snapshot.status !== 'active') {
      return { valid: false, error: 'Price snapshot is no longer active' };
    }

    if (snapshot.expiresAt < new Date()) {
      return { valid: false, error: 'Price snapshot has expired' };
    }

    return { valid: true, snapshot };
  }
}
