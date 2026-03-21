import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IFcmTokenDoc extends Document {
  userId: Types.ObjectId;
  token: string;
  deviceInfo: string | null;
  createdAt: Date;
}

const fcmTokenSchema = new Schema<IFcmTokenDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    token: { type: String, required: true },
    deviceInfo: { type: String, default: null },
  },
  { timestamps: true },
);

fcmTokenSchema.index({ userId: 1 });
fcmTokenSchema.index({ token: 1 }, { unique: true });

export const FcmToken = mongoose.model<IFcmTokenDoc>('FcmToken', fcmTokenSchema);
