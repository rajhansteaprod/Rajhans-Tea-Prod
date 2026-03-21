import { z } from 'zod';

export const createOrderSchema = z.object({
  body: z.object({
    address: z.object({
      name: z.string().min(1),
      phone: z.string().min(10).max(10),
      street: z.string().min(1),
      city: z.string().min(1),
      state: z.string().min(1),
      pincode: z.string().length(6),
    }),
    walletAmount: z.number({ coerce: true }).min(0).optional(),
  }),
});

export const verifyPaymentSchema = z.object({
  body: z.object({
    razorpayOrderId: z.string().min(1),
    razorpayPaymentId: z.string().min(1),
    razorpaySignature: z.string().min(1),
  }),
});

export const refundSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid payment ID'),
  }),
  body: z.object({
    amount: z.number({ coerce: true }).positive(),
    reason: z.string().min(1).max(500),
  }),
});

export const walletCreditSchema = z.object({
  body: z.object({
    userId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid user ID'),
    amount: z.number({ coerce: true }).positive().max(100000),
    description: z.string().min(1).max(500),
  }),
});
