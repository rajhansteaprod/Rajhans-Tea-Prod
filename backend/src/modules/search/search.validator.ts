import { z } from 'zod';

const mongoId = z
  .string()
  .regex(/^[a-f\d]{24}$/i)
  .optional();

export const searchSchema = z.object({
  query: z.object({
    q: z.string().trim().max(200).optional().default(''),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(60).optional(),
    sort: z
      .enum(['relevance', 'price_asc', 'price_desc', 'newest', 'name_asc', 'featured'])
      .optional(),
    categoryId: mongoId,
    categorySlug: z.string().max(120).optional(),
    collectionId: mongoId,
    priceMin: z.coerce.number().min(0).optional(),
    priceMax: z.coerce.number().min(0).optional(),
    inStock: z
      .string()
      .transform((v) => v === 'true')
      .optional(),
    tags: z.string().optional(),
  }),
});

export const autocompleteSchema = z.object({
  query: z.object({
    q: z.string().trim().min(1).max(100),
    limit: z.coerce.number().int().min(1).max(10).optional(),
  }),
});
