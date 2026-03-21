import mongoose, { Document, Schema, Types } from 'mongoose';

export type CampaignType = 'flash_sale' | 'seasonal' | 'clearance';

export interface ICampaignDoc extends Document {
  name: string;
  slug: string;
  type: CampaignType;
  description: string;
  bannerImage: string;
  bannerLink: string;
  discountType: 'percentage' | 'fixed_price';
  discountValue: number;
  scope: 'products' | 'categories' | 'collections';
  productIds: Types.ObjectId[];
  categoryIds: Types.ObjectId[];
  collectionIds: Types.ObjectId[];
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
  priority: number;
  linkedPriceRuleIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const campaignSchema = new Schema<ICampaignDoc>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    type: { type: String, enum: ['flash_sale', 'seasonal', 'clearance'], required: true },
    description: { type: String, default: '' },
    bannerImage: { type: String, default: '' },
    bannerLink: { type: String, default: '' },
    discountType: { type: String, enum: ['percentage', 'fixed_price'], required: true },
    discountValue: { type: Number, required: true },
    scope: { type: String, enum: ['products', 'categories', 'collections'], required: true },
    productIds: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    categoryIds: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
    collectionIds: [{ type: Schema.Types.ObjectId, ref: 'Collection' }],
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    isActive: { type: Boolean, default: false },
    priority: { type: Number, default: 0 },
    linkedPriceRuleIds: [{ type: Schema.Types.ObjectId, ref: 'PriceRule' }],
  },
  { timestamps: true },
);

campaignSchema.index({ slug: 1 }, { unique: true });
campaignSchema.index({ isActive: 1, startsAt: 1, endsAt: 1 });

export const Campaign = mongoose.model<ICampaignDoc>('Campaign', campaignSchema);
