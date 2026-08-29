import mongoose, { Document, Schema } from 'mongoose';
import { Market, OpportunityState } from '../market.types';

/**
 * One search-market discovery execution. `costEstimateUsd` and `costActualUsd`
 * are tracked SEPARATELY (estimate is pre-flight; actual is filled when a provider
 * reports real spend). `status: 'pending-approval'` is the manual-approval gate.
 */
export interface ISearchMarketRunDoc extends Document {
  trigger: 'manual' | 'scheduled';
  status: 'pending-approval' | 'running' | 'completed' | 'degraded' | 'failed';
  market: Market;
  seedIds: mongoose.Types.ObjectId[];
  providersUsed: string[];
  costEstimateUsd: number | null; // null = UNKNOWN (never treated as 0)
  costActualUsd: number; // recorded actual spend for this run (0 until known)
  counts: {
    keywordsDiscovered: number;
    keywordsRetained: number;
    keywordsRejected: number;
    clusters: number;
    opportunities: number;
  };
  degradedReason: string | null;
  error: string | null; // sanitized
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ISearchMarketRunDoc>(
  {
    trigger: { type: String, enum: ['manual', 'scheduled'], required: true },
    status: { type: String, enum: ['pending-approval', 'running', 'completed', 'degraded', 'failed'], default: 'pending-approval', index: true },
    market: { type: Schema.Types.Mixed, required: true },
    seedIds: [{ type: Schema.Types.ObjectId, ref: 'SearchSeed' }],
    providersUsed: { type: [String], default: [] },
    costEstimateUsd: { type: Number, default: null },
    costActualUsd: { type: Number, default: 0 },
    counts: {
      keywordsDiscovered: { type: Number, default: 0 },
      keywordsRetained: { type: Number, default: 0 },
      keywordsRejected: { type: Number, default: 0 },
      clusters: { type: Number, default: 0 },
      opportunities: { type: Number, default: 0 },
    },
    degradedReason: { type: String, default: null },
    error: { type: String, default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

schema.index({ createdAt: -1 });

export const SearchMarketRun = mongoose.model<ISearchMarketRunDoc>('SearchMarketRun', schema);

/** Lifecycle states reused by clusters/opportunities (kept here for co-location). */
export const OPPORTUNITY_STATES: OpportunityState[] = [
  'discovered', 'validated', 'recommended', 'accepted', 'rejected', 'targeted', 'monitoring', 'winning', 'declining', 'resolved',
];
