import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IExperimentExposureDoc extends Document {
  experimentSlug: string;
  userId: Types.ObjectId | null;
  sessionId: string;
  variant: string;
  createdAt: Date;
}

const experimentExposureSchema = new Schema<IExperimentExposureDoc>(
  {
    experimentSlug: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    sessionId: { type: String, required: true },
    variant: { type: String, required: true },
  },
  { timestamps: true },
);

experimentExposureSchema.index({ experimentSlug: 1, sessionId: 1 });
experimentExposureSchema.index({ experimentSlug: 1, variant: 1 });
experimentExposureSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const ExperimentExposure = mongoose.model<IExperimentExposureDoc>('ExperimentExposure', experimentExposureSchema);
