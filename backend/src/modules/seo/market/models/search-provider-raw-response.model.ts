import mongoose, { Document, Schema } from 'mongoose';

/**
 * OPTIONAL raw provider evidence, quarantined from normalized intelligence.
 *
 * Licence-respecting (refinement 7): the `payload` is stored ONLY when the
 * provider's config allows it, and may be bounded by a TTL (`expiresAt`, enforced
 * by a Mongo TTL index). The PROVENANCE fields (provider, capability, run, request
 * params/hash, retrievedAt, sourceFreshness) are ALWAYS retained — so expiring or
 * never storing the raw payload never makes a past opportunity decision
 * unreconstructable (the normalized SearchKeyword/SearchKeywordMetric + this
 * provenance remain).
 */
export interface ISearchProviderRawResponseDoc extends Document {
  runId: mongoose.Types.ObjectId;
  provider: string;
  capability: string; // 'keyword-demand' | 'serp' | ...
  op: string;
  requestParams: Record<string, unknown>;
  requestHash: string;
  retrievedAt: Date;
  sourceFreshness: Date | null;
  provenance: string;
  payload: unknown | null; // null when rawStorageAllowed=false for the provider
  expiresAt: Date | null; // TTL for the payload where retention is bounded
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ISearchProviderRawResponseDoc>(
  {
    runId: { type: Schema.Types.ObjectId, ref: 'SearchMarketRun', required: true, index: true },
    provider: { type: String, required: true },
    capability: { type: String, required: true },
    op: { type: String, required: true },
    requestParams: { type: Schema.Types.Mixed, default: {} },
    requestHash: { type: String, required: true },
    retrievedAt: { type: Date, required: true },
    sourceFreshness: { type: Date, default: null },
    provenance: { type: String, default: '' },
    payload: { type: Schema.Types.Mixed, default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// TTL: expire the DOCUMENT's raw payload when expiresAt passes. (Provenance that must
// outlive the raw payload is preserved on SearchKeyword/SearchKeywordMetric; if longer
// provenance retention is needed here, a nulling job replaces payload instead of deleting.)
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ provider: 1, requestHash: 1 });

export const SearchProviderRawResponse = mongoose.model<ISearchProviderRawResponseDoc>('SearchProviderRawResponse', schema);
