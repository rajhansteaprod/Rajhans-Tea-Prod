import mongoose, { Document, Schema } from 'mongoose';

export interface IVariant {
  key: string;
  weight: number;
  description: string;
}

export interface IExperimentDoc extends Document {
  name: string;
  slug: string;
  description: string;
  variants: IVariant[];
  status: 'draft' | 'running' | 'completed';
  targetMetric: string;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const variantSchema = new Schema<IVariant>(
  { key: { type: String, required: true }, weight: { type: Number, required: true, min: 0, max: 100 }, description: { type: String, default: '' } },
  { _id: false },
);

const experimentSchema = new Schema<IExperimentDoc>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, default: '' },
    variants: [variantSchema],
    status: { type: String, enum: ['draft', 'running', 'completed'], default: 'draft' },
    targetMetric: { type: String, default: 'conversion_rate' },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
  },
  { timestamps: true },
);

experimentSchema.index({ slug: 1 }, { unique: true });
experimentSchema.index({ status: 1 });

export const Experiment = mongoose.model<IExperimentDoc>('Experiment', experimentSchema);
