import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IHomepageSectionDoc extends Document {
  title: string;
  productIds: Types.ObjectId[];
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const homepageSectionSchema = new Schema<IHomepageSectionDoc>(
  {
    title: { type: String, required: true, trim: true },
    productIds: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

homepageSectionSchema.index({ sortOrder: 1 });
homepageSectionSchema.index({ isActive: 1 });

export const HomepageSection = mongoose.model<IHomepageSectionDoc>(
  'HomepageSection',
  homepageSectionSchema
);
