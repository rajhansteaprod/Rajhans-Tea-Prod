import mongoose, { Document, Schema, Types } from 'mongoose';

// Device info captured at login time and updated on each refresh
export interface IDeviceInfo {
  userAgent: string;
  ip: string;
  browser: string; // e.g. "Chrome 120"
  os: string; // e.g. "Windows" / "iOS 17" / "Android 14"
  deviceType: 'mobile' | 'desktop' | 'tablet';
  deviceName: string; // human-friendly: "Chrome 120 on Windows"
}

export interface ITokenDoc extends Document {
  user: Types.ObjectId;
  token: string;
  type: 'refresh';
  expiresAt: Date;
  deviceInfo: IDeviceInfo;
  lastUsedAt: Date; // updated every time this token is used to refresh
  createdAt: Date;
  updatedAt: Date;
}

const deviceInfoSchema = new Schema<IDeviceInfo>(
  {
    userAgent: { type: String, default: 'Unknown' },
    ip: { type: String, default: 'Unknown' },
    browser: { type: String, default: 'Unknown Browser' },
    os: { type: String, default: 'Unknown OS' },
    deviceType: { type: String, enum: ['mobile', 'desktop', 'tablet'], default: 'desktop' },
    deviceName: { type: String, default: 'Unknown Device' },
  },
  { _id: false }, // embedded doc, no separate _id
);

const tokenSchema = new Schema<ITokenDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true },
    type: { type: String, enum: ['refresh'], required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    deviceInfo: { type: deviceInfoSchema, default: () => ({}) },
    lastUsedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const Token = mongoose.model<ITokenDoc>('Token', tokenSchema);
