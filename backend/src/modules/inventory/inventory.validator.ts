import { z } from 'zod';

const mongoId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID');

export const adjustStockSchema = z.object({
  params: z.object({ productId: mongoId }),
  body: z.object({
    qty: z.number({ coerce: true }).int(),
    note: z.string().min(1).max(500),
  }),
});

export const createWarehouseSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    address: z.object({
      street: z.string().min(1),
      city: z.string().min(1),
      state: z.string().min(1),
      pincode: z.string().length(6),
      phone: z.string().min(10).max(10),
      email: z.string().email(),
    }),
    isDefault: z.boolean().optional(),
  }),
});

export const updateWarehouseSchema = z.object({
  params: z.object({ id: mongoId }),
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    address: z
      .object({
        street: z.string().min(1),
        city: z.string().min(1),
        state: z.string().min(1),
        pincode: z.string().length(6),
        phone: z.string().min(10).max(10),
        email: z.string().email(),
      })
      .optional(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const updateOrderStatusSchema = z.object({
  params: z.object({ orderId: mongoId }),
  body: z.object({
    status: z.enum([
      'confirmed', 'processing', 'shipped', 'in_transit',
      'out_for_delivery', 'delivered', 'cancelled', 'return_requested', 'returned',
    ]),
    note: z.string().max(500).optional(),
  }),
});

export const cancelOrderSchema = z.object({
  params: z.object({ orderId: mongoId }),
  body: z.object({
    reason: z.string().min(1).max(500),
  }),
});

export const orderIdSchema = z.object({
  params: z.object({ orderId: mongoId }),
});

export const shippingRateSchema = z.object({
  query: z.object({
    pincode: z.string().length(6),
    weight: z.string().optional(),
  }),
});
