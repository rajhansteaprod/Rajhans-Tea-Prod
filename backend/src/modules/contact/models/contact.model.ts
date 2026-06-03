import { Schema, model, Document } from 'mongoose';

export type ContactReason = 'help' | 'bulk' | 'gifting';

export interface IContact extends Document {
  referenceId: string;
  fullName: string;
  mobileNumber: string;
  emailAddress: string;
  address?: string;
  reasonToContact: ContactReason;
  message?: string;
  companyName?: string;
  preferredDeliveryDate?: Date;
  status: 'new' | 'contacted' | 'resolved';
  internalNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ContactSchema = new Schema<IContact>(
  {
    referenceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    mobileNumber: {
      type: String,
      required: true,
      trim: true,
    },
    emailAddress: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    reasonToContact: {
      type: String,
      enum: ['help', 'bulk', 'gifting'],
      required: true,
    },
    message: String,
    companyName: String,
    preferredDeliveryDate: Date,
    status: {
      type: String,
      enum: ['new', 'contacted', 'resolved'],
      default: 'new',
    },
    internalNotes: String,
  },
  {
    timestamps: true,
  }
);

export const Contact = model<IContact>('Contact', ContactSchema);
