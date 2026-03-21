import { z } from 'zod';

const mongoId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID');

export const trackViewSchema = z.object({
  body: z.object({ productId: mongoId }),
});

export const productIdParamSchema = z.object({
  params: z.object({ productId: mongoId }),
});

export const crossSellSchema = z.object({
  query: z.object({
    productIds: z.string().min(1),
  }),
});

export const createRuleSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200),
    slug: z.string().max(220).optional(),
    type: z.enum(['manual', 'automated']),
    section: z.enum(['trending', 'recommended', 'featured_collections', 'new_arrivals', 'banner']),
    pinnedProducts: z.array(mongoId).optional(),
    strategy: z.enum(['top_selling', 'new_arrivals', 'low_stock', 'most_viewed', 'category_top']).nullable().optional(),
    strategyConfig: z.object({
      categoryId: mongoId.optional(),
      lookbackDays: z.number({ coerce: true }).int().min(1).optional(),
      limit: z.number({ coerce: true }).int().min(1).max(50).optional(),
      minStock: z.number({ coerce: true }).int().min(1).optional(),
    }).optional(),
    priority: z.number({ coerce: true }).int().min(0).optional(),
    isActive: z.boolean().optional(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
  }),
});

export const createBannerSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(200),
    subtitle: z.string().max(500).nullable().optional(),
    image: z.string().min(1),
    link: z.string().nullable().optional(),
    position: z.number({ coerce: true }).int().min(0).optional(),
    isActive: z.boolean().optional(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
  }),
});
