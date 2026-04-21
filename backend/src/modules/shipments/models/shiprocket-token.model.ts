import { Schema, model, Document } from 'mongoose';

export interface IShiprocketToken extends Document {
  token: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ShiprocketTokenSchema = new Schema<IShiprocketToken>(
  {
    token: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'shiprocket_tokens',
  },
);

export const ShiprocketToken = model<IShiprocketToken>(
  'ShiprocketToken',
  ShiprocketTokenSchema,
);
