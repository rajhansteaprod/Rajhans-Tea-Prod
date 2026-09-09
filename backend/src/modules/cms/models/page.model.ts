import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IPageDoc extends Document {
  title: string;
  slug: string;
  content: string;
  metaTitle: string;
  metaDescription: string;
  status: 'draft' | 'published';
  updatedBy: Types.ObjectId | null;
  /**
   * Phase 6.5A — controlled FAQPage structured-data execution. Stores the
   * exact approved JSON-LD object (as a JSON string, so it compares and
   * restores exactly like every other whitelisted executable field) that was
   * deterministically derived from this same page's own `content` at
   * execution time. Empty string means no schema has been approved/executed
   * yet. Never hand-authored — only ever written by the FAQ schema executor.
   */
  faqSchema: string;
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
    faqSchema: { type: String, default: '' },
  },
  { timestamps: true },
);

pageSchema.index({ slug: 1 }, { unique: true });
pageSchema.index({ status: 1 });

export const Page = mongoose.model<IPageDoc>('Page', pageSchema);
