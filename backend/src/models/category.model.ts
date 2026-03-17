import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ICategoryDoc extends Document {
  name: string;
  slug: string;
  description?: string;
  image?: string;
  parent: Types.ObjectId | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<ICategoryDoc>(
  {
    name:        { type: String, required: true, trim: true },
    slug:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true },
    image:       { type: String },
    parent:      { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    isActive:    { type: Boolean, default: true },
    sortOrder:   { type: Number, default: 0 },
  },
  { timestamps: true },
);

categorySchema.index({ slug: 1 });
categorySchema.index({ parent: 1, isActive: 1 });

export const Category = mongoose.model<ICategoryDoc>('Category', categorySchema);
