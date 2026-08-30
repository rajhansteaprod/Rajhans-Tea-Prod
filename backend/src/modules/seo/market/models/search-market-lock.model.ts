import mongoose, { Document, Schema } from 'mongoose';

/**
 * Singleton document (_id fixed to 'singleton') — the atomic single-flight
 * primitive for orchestrated market runs (4b.7). No BullMQ worker exists in
 * this phase, so this is the sole concurrency guard. Acquisition/reclaim MUST
 * go through market-run-lock.service.ts's atomic findOneAndUpdate — never a
 * find-then-create sequence (race-prone).
 */
export interface ISearchMarketLockDoc extends Document<string> {
  ownerRunId: mongoose.Types.ObjectId | null;
  acquiredAt: Date | null;
  heartbeatAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ISearchMarketLockDoc>(
  {
    _id: { type: String, required: true },
    ownerRunId: { type: Schema.Types.ObjectId, ref: 'SearchMarketRun', default: null },
    acquiredAt: { type: Date, default: null },
    heartbeatAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const SearchMarketLock = mongoose.model<ISearchMarketLockDoc>('SearchMarketLock', schema);
export const SEARCH_MARKET_LOCK_ID = 'singleton';
