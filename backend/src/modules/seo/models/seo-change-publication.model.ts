import mongoose, { Document, Schema } from 'mongoose';

/**
 * Publication is deliberately separate from SeoChangeExecution.
 *
 * Execution proves the CMS/database mutation committed.
 * Publication proves the static/prerendered frontend was rebuilt and deployed.
 *
 * Historical executions created before this model have no publication record
 * and keep the Phase 5.4 verification behaviour they had at creation time.
 */
export type SeoChangePublicationStatus =
  | 'pending'
  | 'building'
  | 'published'
  | 'failed';

export interface ISeoChangePublicationDoc extends Document {
  executionId: mongoose.Types.ObjectId;
  recommendationId: mongoose.Types.ObjectId;
  draftId: mongoose.Types.ObjectId;

  requestedByUserId: mongoose.Types.ObjectId;
  requestedAt: Date;

  status: SeoChangePublicationStatus;

  startedAt: Date | null;
  publishedAt: Date | null;
  failedAt: Date | null;

  frontendImage: string | null;
  frontendSourceRef: string | null;

  attemptCount: number;
  errorMessage: string | null;

  publicationVersion: string;

  verificationId?: mongoose.Types.ObjectId | null;
  verificationStatus?: string | null;

  /**
   * Snapshot of each prior failed attempt, captured immediately before a
   * retry resets the live failure fields (failedAt/errorMessage) for the
   * next attempt — so retrying a failed publication doesn't destroy the
   * forensic record of why it failed before.
   */
  retryHistory: PublicationRetryHistoryEntry[];

  /**
   * Bounded recovery path for a publication that reached `published` but
   * whose post-publish content verification came back `mismatch`/
   * `fetch_failed` (e.g. a stale prerender manifest). Distinct from
   * retryHistory (which is for the pending<-failed loop) because the
   * starting state, eligibility rule, and the field being audited
   * (verificationStatus, not errorMessage) are all different.
   */
  redeployAttemptCount: number;
  redeployHistory: PublicationRedeployEntry[];

  createdAt: Date;
  updatedAt: Date;
}

export interface PublicationRetryHistoryEntry {
  status: 'failed';
  failedAt: Date | null;
  errorMessage: string | null;
  attemptCount: number;
  retriedAt: Date;
}

/** One snapshot of the pre-redeploy state, captured immediately before a bounded redeploy/reverify attempt resets published->building. */
export interface PublicationRedeployEntry {
  attemptedAt: Date;
  sourceRevision: string;
  previousFrontendImage: string | null;
  previousFrontendSourceRef: string | null;
  previousVerificationId: mongoose.Types.ObjectId | null;
  previousVerificationStatus: string | null;
}

const seoChangePublicationSchema =
  new Schema<ISeoChangePublicationDoc>(
    {
      executionId: {
        type: Schema.Types.ObjectId,
        ref: 'SeoChangeExecution',
        required: true,
      },

      recommendationId: {
        type: Schema.Types.ObjectId,
        ref: 'SeoRecommendation',
        required: true,
        index: true,
      },

      draftId: {
        type: Schema.Types.ObjectId,
        ref: 'SeoChangeDraft',
        required: true,
      },

      requestedByUserId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },

      requestedAt: {
        type: Date,
        required: true,
      },

      status: {
        type: String,
        enum: ['pending', 'building', 'published', 'failed'],
        required: true,
        default: 'pending',
        index: true,
      },

      startedAt: {
        type: Date,
        default: null,
      },

      publishedAt: {
        type: Date,
        default: null,
      },

      failedAt: {
        type: Date,
        default: null,
      },

      frontendImage: {
        type: String,
        default: null,
      },

      frontendSourceRef: {
        type: String,
        default: null,
      },

      attemptCount: {
        type: Number,
        default: 0,
      },

      errorMessage: {
        type: String,
        default: null,
      },

      publicationVersion: {
        type: String,
        required: true,
      },

      verificationId: {
        type: Schema.Types.ObjectId,
        ref: 'SeoChangeVerification',
        default: null,
      },

      verificationStatus: {
        type: String,
        default: null,
      },

      retryHistory: {
        type: [
          {
            _id: false,
            status: { type: String, enum: ['failed'], required: true },
            failedAt: { type: Date, default: null },
            errorMessage: { type: String, default: null },
            attemptCount: { type: Number, required: true },
            retriedAt: { type: Date, required: true },
          },
        ],
        default: [],
      },

      redeployAttemptCount: {
        type: Number,
        default: 0,
      },

      redeployHistory: {
        type: [
          {
            _id: false,
            attemptedAt: { type: Date, required: true },
            sourceRevision: { type: String, required: true },
            previousFrontendImage: { type: String, default: null },
            previousFrontendSourceRef: { type: String, default: null },
            previousVerificationId: { type: Schema.Types.ObjectId, ref: 'SeoChangeVerification', default: null },
            previousVerificationStatus: { type: String, default: null },
          },
        ],
        default: [],
      },
    },
    {
      timestamps: true,
    },
  );

// One publication lifecycle per successful execution.
seoChangePublicationSchema.index(
  { executionId: 1 },
  { unique: true },
);

// Publisher queue lookup.
seoChangePublicationSchema.index({
  status: 1,
  requestedAt: 1,
});

export const SeoChangePublication =
  mongoose.model<ISeoChangePublicationDoc>(
    'SeoChangePublication',
    seoChangePublicationSchema,
  );
