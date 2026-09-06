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

  createdAt: Date;
  updatedAt: Date;
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
