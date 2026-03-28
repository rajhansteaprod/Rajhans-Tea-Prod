import mongoose, { Document, Schema } from 'mongoose';

export interface IHeroSlideDoc extends Document {
  title: string;
  subtitle: string;
  ctaText: string;
  ctaLink: string;
  desktopImage: string;
  mobileImage: string;
  textAlign: 'left' | 'center' | 'right';
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const heroSlideSchema = new Schema<IHeroSlideDoc>(
  {
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, default: '', trim: true },
    ctaText: { type: String, default: 'Explore', trim: true },
    ctaLink: { type: String, default: '/products', trim: true },
    desktopImage: { type: String, required: true },
    mobileImage: { type: String, required: true },
    textAlign: { type: String, enum: ['left', 'center', 'right'], default: 'center' },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

heroSlideSchema.index({ isActive: 1, order: 1 });

export const HeroSlide = mongoose.model<IHeroSlideDoc>('HeroSlide', heroSlideSchema);
