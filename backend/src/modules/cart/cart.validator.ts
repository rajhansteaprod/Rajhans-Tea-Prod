import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid product ID');

export const addItemSchema = z.object({
  body: z.object({
    productId: objectId,
    qty: z.number({ coerce: true }).int().min(1).max(10),
  }),
});

export const updateItemSchema = z.object({
  params: z.object({ productId: objectId }),
  body: z.object({
    qty: z.number({ coerce: true }).int().min(1).max(10),
  }),
});

export const removeItemSchema = z.object({
  params: z.object({ productId: objectId }),
});

export const mergeCartSchema = z.object({
  body: z.object({
    guestSessionId: z.string().min(1, 'guestSessionId is required'),
  }),
});

export const toggleWishlistSchema = z.object({
  params: z.object({ productId: objectId }),
});

export const mergeWishlistSchema = z.object({
  body: z.object({
    guestSessionId: z.string().min(1, 'guestSessionId is required'),
  }),
});
