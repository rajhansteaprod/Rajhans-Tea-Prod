import mongoose, { Document, Schema } from 'mongoose';

export interface IAddressDoc {
  label: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

export interface IUserDoc extends Document {
  phone: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role: 'customer' | 'admin';
  isPhoneVerified: boolean;
  addresses: IAddressDoc[];
  avatar?: string;
  isActive: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const addressSchema = new Schema<IAddressDoc>(
  {
    label: { type: String, required: true },
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true, default: 'India' },
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
  },
  {
    timestamps: true,
  },
);

export const User = mongoose.model<IUserDoc>('User', userSchema);
