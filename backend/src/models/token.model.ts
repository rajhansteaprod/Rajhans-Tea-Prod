import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ITokenDoc extends Document {
  user: Types.ObjectId;
  token: string;
  type: 'refresh';
  expiresAt: Date;
  createdAt: Date;
}

const tokenSchema = new Schema<ITokenDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true },
    type: { type: String, enum: ['refresh'], required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  {
    timestamps: true,
  },
);

export const Token = mongoose.model<ITokenDoc>('Token', tokenSchema);
