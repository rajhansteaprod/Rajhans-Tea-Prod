import mongoose, { Document, Schema } from 'mongoose';
import { Intent, Market } from '../market.types';

/**
 * SearchCluster — schema/types only in 4b.3. NO service in this phase writes to
 * this collection: `clustering.engine.ts`'s `clusterKeywords()` is a pure,
 * in-memory function returning `ClusterResult[]`; nothing here supersedes prior
 * clusters, inserts new generations, or updates `SearchKeyword.clusterId`. That
 * run-orchestration/persistence lifecycle is explicitly deferred to a later
 * phase. `status`/`version`/`runId` exist now so that future service has a
 * stable schema to target without a migration.
 *
 * `serpOverlapEvidence` is a nullable, STRUCTURED field (not "a field that can
 * only ever be null") — 4b.5 populates it once a real SerpOverlapProvider
 * exists; it stays null for every 4b.3 document.
 *
 * No 'merged' status/lineage: no component in this phase infers a merge, so
 * none is claimed. Only 'active' | 'superseded' exist, for a future persistence
 * service to use.
 */

export interface IClusterMembershipReason {
  signal: 'lexical' | 'entity' | 'modifier' | 'intent' | 'serp';
  score: number;
  detail?: string;
}
export interface IClusterMembership {
  keywordId: mongoose.Types.ObjectId;
  keyword: string;
  membershipScore: number; // similarity to the cluster's medoid
  reasons: IClusterMembershipReason[];
}
export interface IClusterSerpOverlapEvidence {
  score: number;
  sharedDomains: string[];
  sharedUrls: string[];
  reasons: string[];
  capturedAt: Date;
}

export interface ISearchClusterDoc extends Document {
  market: Market;
  label: string;
  primaryIntent: Intent | null;
  intents: { intent: Intent; confidence: number; reasons: string[] }[];
  memberships: IClusterMembership[];
  clusterReasons: string[];
  serpOverlapEvidence: IClusterSerpOverlapEvidence | null; // always null in 4b.3
  status: 'active' | 'superseded';
  version: number;
  runId: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

// Mirrors search-keyword.model.ts's `intentSchema` shape (not imported — that
// file is out of this phase's approved edit scope; kept identical intentionally).
const clusterIntentSchema = new Schema(
  { intent: { type: String }, confidence: { type: Number }, reasons: { type: [String], default: [] } },
  { _id: false },
);

const membershipReasonSchema = new Schema(
  {
    signal: { type: String, enum: ['lexical', 'entity', 'modifier', 'intent', 'serp'], required: true },
    score: { type: Number, required: true },
    detail: { type: String },
  },
  { _id: false },
);

const membershipSchema = new Schema(
  {
    keywordId: { type: Schema.Types.ObjectId, ref: 'SearchKeyword', required: true },
    keyword: { type: String, required: true },
    membershipScore: { type: Number, required: true },
    reasons: { type: [membershipReasonSchema], default: [] },
  },
  { _id: false },
);

const schema = new Schema<ISearchClusterDoc>(
  {
    market: { type: Schema.Types.Mixed, required: true }, // same convention as every other 4b model
    label: { type: String, required: true },
    primaryIntent: { type: String, default: null },
    intents: { type: [clusterIntentSchema], default: [] },
    memberships: { type: [membershipSchema], default: [] },
    clusterReasons: { type: [String], default: [] },
    serpOverlapEvidence: { type: Schema.Types.Mixed, default: null },
    status: { type: String, enum: ['active', 'superseded'], default: 'active' },
    version: { type: Number, default: 1 },
    runId: { type: Schema.Types.ObjectId, ref: 'SearchMarketRun', default: null },
  },
  { timestamps: true },
);

schema.index({ 'market.country': 1, 'market.language': 1, status: 1 });
schema.index({ runId: 1 });

export const SearchCluster = mongoose.model<ISearchClusterDoc>('SearchCluster', schema);
