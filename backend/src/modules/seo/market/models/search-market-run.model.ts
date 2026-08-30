import mongoose, { Document, Schema } from 'mongoose';
import { Market, OpportunityState } from '../market.types';

/**
 * One search-market discovery execution. `costEstimateUsd` and `costActualUsd`
 * are tracked SEPARATELY (estimate is pre-flight; actual is filled when a provider
 * reports real spend). `status: 'pending-approval'` is the manual-approval gate.
 */
export type MarketRunStage =
  | 'planning'
  | 'discovery'
  | 'initial-clustering'
  | 'preliminary-mapping'
  | 'serp-fetch'
  | 'final-clustering'
  | 'final-mapping'
  | 'scoring'
  | 'persisting'
  | 'finished';

export type MarketRunPersistenceStage = 'not-started' | 'upserting' | 'upserted' | 'resolving' | 'done';

export interface IPlanSnapshot {
  plannedDiscoveryTaskCount: number;
  plannedSerpRequestCount: number;
  estimatedCostUsd: number;
  market: Market;
  plannedAt: Date;
  pricingVersion: string;
  evidenceFreshnessSnapshotAt: Date;
  planFingerprint: string;
}

export interface IEvaluationSnapshot {
  version: number;
  generatedAt: Date;
  draftFingerprints: string[];
  draftCount: number;
  snapshotHash: string;
  drafts: Record<string, unknown>[]; // sanitized MarketOpportunityDraft[] — Mixed to avoid a cross-model type import cycle
  evaluationOutcome: 'completed' | 'degraded';
  allowResolution: boolean;
  degradationReasons: string[];
}

export interface ISearchMarketRunDoc extends Document {
  trigger: 'manual' | 'scheduled';
  status: 'pending-approval' | 'running' | 'completed' | 'degraded' | 'failed';
  market: Market;
  seedIds: mongoose.Types.ObjectId[];
  providersUsed: string[];
  costEstimateUsd: number | null; // null = UNKNOWN (never treated as 0)
  costActualUsd: number; // recorded actual spend for this run (0 until known) — reserved atomically per physical attempt
  counts: {
    keywordsDiscovered: number;
    keywordsRetained: number;
    keywordsRejected: number;
    clusters: number;
    opportunities: number;
    cacheHits: number;
    cacheMisses: number;
    serpsFetched: number;
    mappingsProduced: number;
    recommendationsCreated: number;
    recommendationsUpdated: number;
    recommendationsResolved: number;
  };
  degradedReason: string | null;
  error: string | null; // sanitized
  startedAt: Date | null;
  finishedAt: Date | null;

  // ── 4b.7 — orchestration/cost-authorization/recovery state ──
  authorizationMode: 'confirm-under-threshold' | 'manual-approval' | null;
  approvedCostUsd: number | null; // absolute cumulative ceiling for THIS run
  approvedAt: Date | null;
  approvalSource: 'manual-cli' | null;
  stage: MarketRunStage;
  persistenceStage: MarketRunPersistenceStage;
  planSnapshot: IPlanSnapshot | null;
  evaluationSnapshot: IEvaluationSnapshot | null;

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
      cacheHits: { type: Number, default: 0 },
      cacheMisses: { type: Number, default: 0 },
      serpsFetched: { type: Number, default: 0 },
      mappingsProduced: { type: Number, default: 0 },
      recommendationsCreated: { type: Number, default: 0 },
      recommendationsUpdated: { type: Number, default: 0 },
      recommendationsResolved: { type: Number, default: 0 },
    },
    degradedReason: { type: String, default: null },
    error: { type: String, default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },

    authorizationMode: { type: String, enum: ['confirm-under-threshold', 'manual-approval', null], default: null },
    approvedCostUsd: { type: Number, default: null },
    approvedAt: { type: Date, default: null },
    approvalSource: { type: String, enum: ['manual-cli', null], default: null },
    stage: {
      type: String,
      enum: ['planning', 'discovery', 'initial-clustering', 'preliminary-mapping', 'serp-fetch', 'final-clustering', 'final-mapping', 'scoring', 'persisting', 'finished'],
      default: 'planning',
    },
    persistenceStage: { type: String, enum: ['not-started', 'upserting', 'upserted', 'resolving', 'done'], default: 'not-started' },
    planSnapshot: { type: Schema.Types.Mixed, default: null },
    evaluationSnapshot: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

schema.index({ createdAt: -1 });

export const SearchMarketRun = mongoose.model<ISearchMarketRunDoc>('SearchMarketRun', schema);

/** Lifecycle states reused by clusters/opportunities (kept here for co-location). */
export const OPPORTUNITY_STATES: OpportunityState[] = [
  'discovered', 'validated', 'recommended', 'accepted', 'rejected', 'targeted', 'monitoring', 'winning', 'declining', 'resolved',
];
