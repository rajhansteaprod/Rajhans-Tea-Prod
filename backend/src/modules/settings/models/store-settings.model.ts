import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IStoreSettingsDoc extends Document {
  storeName: string;
  contactEmail: string;
  contactPhone: string;
  currency: string;
  timezone: string;
  defaultTaxPercent: number;
  features: {
    loyaltyEnabled: boolean;
    referralEnabled: boolean;
    reviewAutoApprove: boolean;
    guestCheckout: boolean;
  };
  updatedBy: Types.ObjectId | null;
  updatedAt: Date;
}

const storeSettingsSchema = new Schema<IStoreSettingsDoc>(
  {
    storeName: { type: String, default: 'Rajhans Ecommerce' },
    contactEmail: { type: String, default: '' },
    contactPhone: { type: String, default: '' },
    currency: { type: String, default: 'INR' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    defaultTaxPercent: { type: Number, default: 18 },
    features: {
      loyaltyEnabled: { type: Boolean, default: true },
      referralEnabled: { type: Boolean, default: true },
      reviewAutoApprove: { type: Boolean, default: true },
      guestCheckout: { type: Boolean, default: false },
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export const StoreSettings = mongoose.model<IStoreSettingsDoc>('StoreSettings', storeSettingsSchema);
