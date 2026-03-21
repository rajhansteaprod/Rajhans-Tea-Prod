import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IFeatureFlagDoc extends Document {
  name: string;
  slug: string;
  description: string;
  enabled: boolean;
  rolloutPercent: number;
  environment: 'all' | 'development' | 'production';
  targetUserIds: Types.ObjectId[];
  targetRoles: string[];
  metadata: Record<string, unknown>;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const featureFlagSchema = new Schema<IFeatureFlagDoc>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, default: '' },
    enabled: { type: Boolean, default: false },
    rolloutPercent: { type: Number, default: 100, min: 0, max: 100 },
    environment: { type: String, enum: ['all', 'development', 'production'], default: 'all' },
    targetUserIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    targetRoles: [{ type: String }],
    metadata: { type: Schema.Types.Mixed, default: {} },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

featureFlagSchema.index({ slug: 1 }, { unique: true });
featureFlagSchema.index({ enabled: 1 });

export const FeatureFlag = mongoose.model<IFeatureFlagDoc>('FeatureFlag', featureFlagSchema);
