import mongoose, { Document, Schema, Types } from 'mongoose';

export type NotificationType =
  | 'order_confirmed' | 'order_shipped' | 'order_delivered' | 'order_cancelled'
  | 'payment_captured' | 'payment_refunded'
  | 'review_approved' | 'review_replied'
  | 'loyalty_earned' | 'low_stock_alert' | 'review_reminder'
  | 'announcement';

export interface INotificationDoc extends Document {
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  channels: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotificationDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    link: { type: String, default: null },
    isRead: { type: Boolean, default: false },
    channels: [{ type: String }],
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 }); // 180 days

export const Notification = mongoose.model<INotificationDoc>('Notification', notificationSchema);
