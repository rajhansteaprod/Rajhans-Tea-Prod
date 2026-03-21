import mongoose, { Document, Schema } from 'mongoose';

export interface INotificationTemplateDoc extends Document {
  type: string;
  channels: {
    email: { subject: string; htmlBody: string } | null;
    sms: { body: string } | null;
    push: { title: string; body: string } | null;
  };
  variables: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const notificationTemplateSchema = new Schema<INotificationTemplateDoc>(
  {
    type: { type: String, required: true },
    channels: {
      email: {
        type: { subject: String, htmlBody: String },
        default: null,
      },
      sms: {
        type: { body: String },
        default: null,
      },
      push: {
        type: { title: String, body: String },
        default: null,
      },
    },
    variables: [{ type: String }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

notificationTemplateSchema.index({ type: 1 }, { unique: true });

export const NotificationTemplate = mongoose.model<INotificationTemplateDoc>(
  'NotificationTemplate',
  notificationTemplateSchema,
);
