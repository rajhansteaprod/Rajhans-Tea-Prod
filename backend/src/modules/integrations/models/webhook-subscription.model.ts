import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IWebhookSubscriptionDoc extends Document {
  name: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  lastTriggered: Date | null;
  lastStatus: number | null;
  failCount: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const webhookSubscriptionSchema = new Schema<IWebhookSubscriptionDoc>(
  {
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true },
    secret: { type: String, required: true },
    events: [{ type: String }],
    isActive: { type: Boolean, default: true },
    lastTriggered: { type: Date, default: null },
    lastStatus: { type: Number, default: null },
    failCount: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

webhookSubscriptionSchema.index({ isActive: 1, events: 1 });

export const WebhookSubscription = mongoose.model<IWebhookSubscriptionDoc>(
  'WebhookSubscription',
  webhookSubscriptionSchema,
);
