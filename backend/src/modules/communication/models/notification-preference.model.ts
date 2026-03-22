import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IChannelPrefs {
  email: boolean;
  sms: boolean;
  push: boolean;
}

export interface INotificationPreferenceDoc extends Document {
  userId: Types.ObjectId;
  preferences: Map<string, IChannelPrefs>;
  quietHoursStart: number | null; // hour 0-23, e.g. 22 for 10pm
  quietHoursEnd: number | null; // hour 0-23, e.g. 8 for 8am
  createdAt: Date;
  updatedAt: Date;
}

const notificationPreferenceSchema = new Schema<INotificationPreferenceDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    preferences: {
      type: Map,
      of: { email: Boolean, sms: Boolean, push: Boolean },
      default: new Map(),
    },
    quietHoursStart: { type: Number, default: null, min: 0, max: 23 },
    quietHoursEnd: { type: Number, default: null, min: 0, max: 23 },
  },
  { timestamps: true },
);

notificationPreferenceSchema.index({ userId: 1 }, { unique: true });

export const NotificationPreference = mongoose.model<INotificationPreferenceDoc>(
  'NotificationPreference',
  notificationPreferenceSchema,
);
