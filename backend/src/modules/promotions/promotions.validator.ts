import { z } from 'zod';

const mongoId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID');

export const validateCouponSchema = z.object({
  body: z.object({
    code: z.string().min(1).max(30),
  }),
});

export const createCouponSchema = z.object({
  body: z.object({
    code: z.string().min(2).max(30),
    description: z.string().max(500).optional(),
    discountType: z.enum(['percentage', 'fixed']),
    discountValue: z.number({ coerce: true }).positive(),
    minOrderAmount: z.number({ coerce: true }).min(0).optional(),
    maxDiscountCap: z.number({ coerce: true }).positive().nullable().optional(),
    usageLimitTotal: z.number({ coerce: true }).int().positive().nullable().optional(),
    usageLimitPerUser: z.number({ coerce: true }).int().min(1).optional(),
    validFrom: z.string().or(z.date()),
    validUntil: z.string().or(z.date()),
    scope: z.enum(['all', 'products', 'categories']).optional(),
    productIds: z.array(mongoId).optional(),
    categoryIds: z.array(mongoId).optional(),
    stackable: z.boolean().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const updateCouponSchema = z.object({
  params: z.object({ id: mongoId }),
  body: createCouponSchema.shape.body.partial(),
});

export const couponIdSchema = z.object({
  params: z.object({ id: mongoId }),
});

export const createCampaignSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200),
    slug: z.string().min(1).max(220).optional(),
    type: z.enum(['flash_sale', 'seasonal', 'clearance']),
    description: z.string().max(1000).optional(),
    bannerImage: z.string().optional(),
    bannerLink: z.string().optional(),
    discountType: z.enum(['percentage', 'fixed_price']),
    discountValue: z.number({ coerce: true }).positive(),
    scope: z.enum(['products', 'categories', 'collections']),
    productIds: z.array(mongoId).optional(),
    categoryIds: z.array(mongoId).optional(),
    collectionIds: z.array(mongoId).optional(),
    startsAt: z.string().or(z.date()),
    endsAt: z.string().or(z.date()),
    priority: z.number({ coerce: true }).int().min(0).optional(),
  }),
});

export const loyaltySettingsSchema = z.object({
  body: z.object({
    earnRate: z.number({ coerce: true }).min(0).optional(),
    redeemRate: z.number({ coerce: true }).min(0).optional(),
    expiryDays: z.number({ coerce: true }).int().min(1).optional(),
    minRedeemPoints: z.number({ coerce: true }).int().min(1).optional(),
    maxRedeemPercent: z.number({ coerce: true }).min(1).max(100).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const referralSettingsSchema = z.object({
  body: z.object({
    isActive: z.boolean().optional(),
    referrerRewardType: z.enum(['loyalty_points', 'wallet_credit']).optional(),
    referrerRewardAmount: z.number({ coerce: true }).positive().optional(),
    refereeCouponValue: z.number({ coerce: true }).positive().optional(),
    refereeCouponMinOrder: z.number({ coerce: true }).min(0).optional(),
    codePrefix: z.string().max(10).optional(),
  }),
});
