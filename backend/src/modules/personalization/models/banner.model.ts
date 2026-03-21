import mongoose, { Document, Schema } from 'mongoose';

export interface IBannerDoc extends Document {
  title: string;
  subtitle: string | null;
  image: string;
  link: string | null;
  position: number;
  isActive: boolean;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const bannerSchema = new Schema<IBannerDoc>(
  {
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, default: null },
    image: { type: String, required: true },
    link: { type: String, default: null },
    position: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
  },
  { timestamps: true },
);

bannerSchema.index({ isActive: 1, position: 1 });

export const Banner = mongoose.model<IBannerDoc>('Banner', bannerSchema);
