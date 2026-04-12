import { Schema, model, Document } from 'mongoose';

export interface INewsletter extends Document {
  email: string;
  status: 'active' | 'inactive';
  subscribedAt: Date;
  unsubscribedAt?: Date | null;
  unsubscribeReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const NewsletterSchema = new Schema<INewsletter>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      index: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    subscribedAt: {
      type: Date,
      default: () => new Date(),
      index: true,
    },
    unsubscribedAt: {
      type: Date,
      default: null,
    },
    unsubscribeReason: {
      type: String,
      default: undefined,
    },
  },
  {
    timestamps: true,
    collection: 'newsletters',
  },
);

// Create compound indexes for efficient queries
NewsletterSchema.index({ status: 1, subscribedAt: -1 });
NewsletterSchema.index({ email: 1, status: 1 });

export const Newsletter = model<INewsletter>('Newsletter', NewsletterSchema);
