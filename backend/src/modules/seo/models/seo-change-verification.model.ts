import mongoose, { Document, Schema } from 'mongoose';
import { RedirectHop } from '../seo.types';

/**
 * Phase 5.4A — post-execution verification. Immutable forensic record of ONE
 * manual verification ATTEMPT for ONE Phase 5.3 SeoChangeExecution, checked
 * against the live public page via the existing SEO fetch/parser stack.
 * Purely observational: verifying never mutates Page/SeoChangeExecution/
 * SeoChangeDraft/SeoRecommendation, never resolves a recommendation, and never
 * rolls anything back. Multiple attempts for the same execution are allowed
 * and each is kept — there is deliberately NO unique index on executionId.
 */
export type VerificationStatus = 'verified' | 'mismatch' | 'fetch_failed';

/** Mirrors fetcher.service.ts's FetchResult, minus the raw html body (never persisted). */
export interface VerificationFetchInfo {
  requestedUrl: string;
  finalUrl: string | null;
  finalStatus: number | null;
  redirectChain: RedirectHop[];
  error: string | null;
  transient: boolean;
}

/** Only fields actually present in the execution's proposed/after snapshot are populated. */
export interface VerificationExpected {
  renderedTitle?: string;
  metaDescription?: string;
}

export interface VerificationObserved {
  renderedTitle?: string | null;
  metaDescription?: string | null;
}

export interface VerificationMatches {
  title?: boolean;
  metaDescription?: boolean;
}

export interface VerifiedTarget {
  targetUrl: string;
  targetDocumentId: mongoose.Types.ObjectId;
  fetch: VerificationFetchInfo;
  expected: VerificationExpected;
  observed: VerificationObserved;
  matches: VerificationMatches;
  status: VerificationStatus;
  mismatchFields: string[];
}

export interface ISeoChangeVerificationDoc extends Document {
  executionId: mongoose.Types.ObjectId;
  recommendationId: mongoose.Types.ObjectId;
  draftId: mongoose.Types.ObjectId;
  verifierUserId: mongoose.Types.ObjectId;
  verifiedAt: Date;
  status: VerificationStatus;
  verifierVersion: string;
  targets: VerifiedTarget[];
  createdAt: Date;
}

const redirectHopSchema = new Schema<RedirectHop>(
  { url: { type: String, required: true }, status: { type: Number, required: true } },
  { _id: false },
);

const verificationFetchInfoSchema = new Schema<VerificationFetchInfo>(
  {
    requestedUrl: { type: String, required: true },
    finalUrl: { type: String, default: null },
    finalStatus: { type: Number, default: null },
    redirectChain: { type: [redirectHopSchema], default: [] },
    error: { type: String, default: null },
    transient: { type: Boolean, default: false },
  },
  { _id: false },
);

const verificationExpectedSchema = new Schema<VerificationExpected>(
  { renderedTitle: { type: String }, metaDescription: { type: String } },
  { _id: false },
);

const verificationObservedSchema = new Schema<VerificationObserved>(
  { renderedTitle: { type: String, default: undefined }, metaDescription: { type: String, default: undefined } },
  { _id: false },
);

const verificationMatchesSchema = new Schema<VerificationMatches>(
  { title: { type: Boolean }, metaDescription: { type: Boolean } },
  { _id: false },
);

const verifiedTargetSchema = new Schema<VerifiedTarget>(
  {
    targetUrl: { type: String, required: true },
    targetDocumentId: { type: Schema.Types.ObjectId, required: true },
    fetch: { type: verificationFetchInfoSchema, required: true },
    expected: { type: verificationExpectedSchema, required: true },
    observed: { type: verificationObservedSchema, required: true },
    matches: { type: verificationMatchesSchema, required: true },
    status: { type: String, enum: ['verified', 'mismatch', 'fetch_failed'], required: true },
    mismatchFields: { type: [String], default: [] },
  },
  { _id: false },
);

const seoChangeVerificationSchema = new Schema<ISeoChangeVerificationDoc>(
  {
    executionId: { type: Schema.Types.ObjectId, ref: 'SeoChangeExecution', required: true, index: true },
    recommendationId: { type: Schema.Types.ObjectId, ref: 'SeoRecommendation', required: true, index: true },
    draftId: { type: Schema.Types.ObjectId, ref: 'SeoChangeDraft', required: true },
    verifierUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    verifiedAt: { type: Date, required: true },
    status: { type: String, enum: ['verified', 'mismatch', 'fetch_failed'], required: true },
    verifierVersion: { type: String, required: true },
    targets: { type: [verifiedTargetSchema], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Deliberately NO unique index on executionId — repeated verification attempts
// for the same execution are expected and each is kept as its own record.
seoChangeVerificationSchema.index({ executionId: 1, verifiedAt: -1 });

export const SeoChangeVerification = mongoose.model<ISeoChangeVerificationDoc>(
  'SeoChangeVerification',
  seoChangeVerificationSchema,
);
