import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IPageDoc extends Document {
  title: string;
  slug: string;
  content: string;
  metaTitle: string;
  metaDescription: string;
  status: 'draft' | 'published';
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const pageSchema = new Schema<IPageDoc>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    content: { type: String, default: '' },
    metaTitle: { type: String, default: '' },
    metaDescription: { type: String, default: '' },
    status: { type: String, enum: ['draft', 'published'], default: 'published' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

pageSchema.index({ slug: 1 }, { unique: true });
pageSchema.index({ status: 1 });

export const Page = mongoose.model<IPageDoc>('Page', pageSchema);
