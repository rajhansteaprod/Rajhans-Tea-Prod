import { z } from 'zod';

const coerceOptionalString = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());

// ─── Calculate Price ──────────────────────────────────────────────────────────

export const calculatePriceSchema = z.object({
  body: z.object({
    productId: z.string().min(1),
    basePrice: z.number().min(0),
    categoryId: coerceOptionalString,
    collectionIds: z.array(z.string()).optional(),
    qty: z.number().int().min(1).optional(),
  }),
});

// ─── Price Rules ──────────────────────────────────────────────────────────────

const quantityTierSchema = z.object({
  minQty: z.number().int().min(1),
  maxQty: z.number().int().min(1).nullable(),
  discountPercent: z.number().min(0).max(100),
});

export const createPriceRuleSchema = z.object({
  body: z
    .object({
      name: z.string().min(1).max(120),
      type: z.enum(['quantity_tier', 'percentage', 'fixed_price']),
      scope: z.enum(['product', 'category', 'collection', 'global']),
      productId: coerceOptionalString,
      categoryId: coerceOptionalString,
      collectionId: coerceOptionalString,
      tiers: z.array(quantityTierSchema).optional(),
      discountPercent: z.number().min(0).max(100).optional(),
      fixedPrice: z.number().min(0).optional(),
      priority: z.number().int().min(0).optional(),
      isActive: z.boolean().optional(),
      startsAt: z.string().datetime().optional().nullable(),
      endsAt: z.string().datetime().optional().nullable(),
    })
    .refine(
      (d) => {
        if (d.type === 'quantity_tier') return d.tiers && d.tiers.length > 0;
        if (d.type === 'percentage') return d.discountPercent != null;
        if (d.type === 'fixed_price') return d.fixedPrice != null;
        return true;
      },
      {
        message:
          'Provide tiers for quantity_tier, discountPercent for percentage, fixedPrice for fixed_price',
      },
    ),
});

export const updatePriceRuleSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120).optional(),
    type: z.enum(['quantity_tier', 'percentage', 'fixed_price']).optional(),
    scope: z.enum(['product', 'category', 'collection', 'global']).optional(),
    productId: coerceOptionalString,
    categoryId: coerceOptionalString,
    collectionId: coerceOptionalString,
    tiers: z.array(quantityTierSchema).optional(),
    discountPercent: z.number().min(0).max(100).optional(),
    fixedPrice: z.number().min(0).optional(),
    priority: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
    startsAt: z.string().datetime().optional().nullable(),
    endsAt: z.string().datetime().optional().nullable(),
  }),
});

export const priceRuleIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

// ─── Tax Rules ────────────────────────────────────────────────────────────────

export const createTaxRuleSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120),
    categoryId: coerceOptionalString,
    rate: z.number().min(0).max(100),
    isInclusive: z.boolean().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const updateTaxRuleSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120).optional(),
    categoryId: coerceOptionalString,
    rate: z.number().min(0).max(100).optional(),
    isInclusive: z.boolean().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const taxRuleIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});
