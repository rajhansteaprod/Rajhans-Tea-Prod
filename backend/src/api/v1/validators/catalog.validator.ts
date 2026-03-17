import { z } from 'zod';

const mongoId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID');
const optStr   = (max = 500) =>
  z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(max).optional());

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------

export const listCategoriesSchema = z.object({
  query: z.object({
    page:     z.coerce.number().int().min(1).optional(),
    limit:    z.coerce.number().int().min(1).max(100).optional(),
    search:   z.string().trim().max(100).optional(),
    isActive: z.string().transform((v) => v === 'true').optional(),
  }),
});

export const createCategorySchema = z.object({
  body: z.object({
    name:       z.string().trim().min(1).max(100),
    slug:       optStr(120),
    description: optStr(1000),
    image:      optStr(500),
    parentId:   z.preprocess((v) => (v === '' ? undefined : v), mongoId.optional()),
    sortOrder:  z.coerce.number().int().min(0).optional(),
  }),
});

export const updateCategorySchema = z.object({
  params: z.object({ id: mongoId }),
  body: z.object({
    name:       optStr(100),
    slug:       optStr(120),
    description: optStr(1000),
    image:      optStr(500),
    parentId:   z.preprocess((v) => (v === '' || v === null) ? undefined : v, mongoId.optional()),
    isActive:   z.boolean().optional(),
    sortOrder:  z.coerce.number().int().min(0).optional(),
  }),
});

export const categoryIdSchema = z.object({
  params: z.object({ id: mongoId }),
});

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

export const listCollectionsSchema = z.object({
  query: z.object({
    page:   z.coerce.number().int().min(1).optional(),
    limit:  z.coerce.number().int().min(1).max(100).optional(),
    search: z.string().trim().max(100).optional(),
  }),
});

export const createCollectionSchema = z.object({
  body: z.object({
    name:        z.string().trim().min(1).max(100),
    slug:        optStr(120),
    description: optStr(1000),
    image:       optStr(500),
    isFeatured:  z.boolean().optional(),
    sortOrder:   z.coerce.number().int().min(0).optional(),
  }),
});

export const updateCollectionSchema = z.object({
  params: z.object({ id: mongoId }),
  body: z.object({
    name:        optStr(100),
    slug:        optStr(120),
    description: optStr(1000),
    image:       optStr(500),
    isActive:    z.boolean().optional(),
    isFeatured:  z.boolean().optional(),
    sortOrder:   z.coerce.number().int().min(0).optional(),
  }),
});

export const collectionIdSchema = z.object({
  params: z.object({ id: mongoId }),
});

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

export const listProductsSchema = z.object({
  query: z.object({
    page:         z.coerce.number().int().min(1).optional(),
    limit:        z.coerce.number().int().min(1).max(100).optional(),
    sortBy:       z.enum(['createdAt', 'basePrice', 'name']).optional(),
    sortOrder:    z.enum(['asc', 'desc']).optional(),
    search:       z.string().trim().max(100).optional(),
    categoryId:   z.preprocess((v) => (v === '' ? undefined : v), mongoId.optional()),
    collectionId: z.preprocess((v) => (v === '' ? undefined : v), mongoId.optional()),
    status:       z.enum(['draft', 'active', 'archived', 'all']).optional(),
    isFeatured:   z.string().transform((v) => v === 'true').optional(),
  }),
});

const attributesSchema = z
  .record(z.string(), z.string())
  .optional();

export const createProductSchema = z.object({
  body: z.object({
    name:             z.string().trim().min(1).max(200),
    slug:             optStr(220),
    description:      optStr(5000),
    shortDescription: optStr(300),
    categoryId:       mongoId,
    collectionIds:    z.array(mongoId).optional(),
    basePrice:        z.coerce.number().min(0),
    images:           z.array(z.string().url().or(z.string().startsWith('/'))).optional(),
    attributes:       attributesSchema,
    tags:             z.array(z.string().trim().max(50)).max(20).optional(),
    status:           z.enum(['draft', 'active', 'archived']).optional(),
    isFeatured:       z.boolean().optional(),
  }),
});

export const updateProductSchema = z.object({
  params: z.object({ id: mongoId }),
  body: z.object({
    name:             optStr(200),
    slug:             optStr(220),
    description:      optStr(5000),
    shortDescription: optStr(300),
    categoryId:       z.preprocess((v) => (v === '' ? undefined : v), mongoId.optional()),
    collectionIds:    z.array(mongoId).optional(),
    basePrice:        z.coerce.number().min(0).optional(),
    images:           z.array(z.string().url().or(z.string().startsWith('/'))).optional(),
    attributes:       attributesSchema,
    tags:             z.array(z.string().trim().max(50)).max(20).optional(),
    status:           z.enum(['draft', 'active', 'archived']).optional(),
    isFeatured:       z.boolean().optional(),
  }),
});

export const productIdSchema = z.object({
  params: z.object({ id: mongoId }),
});

export const productSlugSchema = z.object({
  params: z.object({ slug: z.string().min(1).max(220) }),
});
