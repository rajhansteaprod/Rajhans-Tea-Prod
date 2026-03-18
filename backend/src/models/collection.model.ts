import mongoose, { Document, Schema } from 'mongoose';

export interface ICollectionDoc extends Document {
  name: string;
  slug: string;
  description?: string;
  image?: string;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const collectionSchema = new Schema<ICollectionDoc>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true },
    image: { type: String },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

collectionSchema.index({ slug: 1 });
collectionSchema.index({ isFeatured: 1, isActive: 1 });

export const Collection = mongoose.model<ICollectionDoc>('Collection', collectionSchema);
