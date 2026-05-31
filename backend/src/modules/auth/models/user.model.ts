import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IAddressDoc {
  _id: Types.ObjectId;
  label: string;
  address: string;
  landmark?: string;
  city: string;
  state: string;
  pinCode: string;
  isDefault: boolean;
}

export interface IUserDoc extends Document {
  phone: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role: 'customer' | 'admin';
  isPhoneVerified: boolean;
  addresses: Types.DocumentArray<IAddressDoc>;
  avatar?: string;
  isActive: boolean;
  lastLogin?: Date;
  isBanned: boolean;
  bannedAt?: Date;
  bannedReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const addressSchema = new Schema<IAddressDoc>(
  {
    label: { type: String, required: true },
    address: { type: String, required: true },
    landmark: { type: String, default: null },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pinCode: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true },
);

const userSchema = new Schema<IUserDoc>(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
      index: true,
      match: /^[6-9]\d{9}$/,
    },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true, sparse: true },
    role: {
      type: String,
      enum: ['customer', 'admin'],
      default: 'customer',
    },
    isPhoneVerified: { type: Boolean, default: false },
    addresses: [addressSchema],
    avatar: { type: String },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
    isBanned: { type: Boolean, default: false, index: true },
    bannedAt: { type: Date },
    bannedReason: { type: String, trim: true },
  },
  {
    timestamps: true,
  },
);

export const User = mongoose.model<IUserDoc>('User', userSchema);
