import { z } from 'zod';

export const listUsersSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sortBy: z.enum(['createdAt', 'lastLogin', 'firstName', 'phone']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    search: z.string().trim().max(100).optional(),
    role: z.enum(['admin', 'customer']).optional(),
    isActive: z
      .string()
      .transform((v) => v === 'true')
      .optional(),
  }),
});

// Coerce empty strings to undefined so optional fields aren't falsely rejected
const optionalStr = (max = 100) =>
  z.preprocess((v) => (v === '' ? undefined : v), z.string().max(max).optional());

export const createUserSchema = z.object({
  body: z.object({
    phone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian phone number'),
    firstName: optionalStr(50),
    lastName:  optionalStr(50),
    email:     optionalStr(200),
    role: z.enum(['customer', 'admin']).optional(),
  }),
});

export const updateUserSchema = z.object({
  params: z.object({ userId: z.string().regex(/^[a-f\d]{24}$/i) }),
  body: z.object({
    firstName: optionalStr(50),
    lastName:  optionalStr(50),
    email:     z.preprocess((v) => (v === '' || v === null) ? undefined : v, z.string().max(200).optional()),
    role:      z.enum(['customer', 'admin']).optional(),
    isActive:  z.boolean().optional(),
  }),
});

export const banUserSchema = z.object({
  params: z.object({ userId: z.string().regex(/^[a-f\d]{24}$/i) }),
  body: z.object({
    reason: z.string().max(200).optional(),
  }),
});

export const userIdSchema = z.object({
  params: z.object({ userId: z.string().regex(/^[a-f\d]{24}$/i) }),
});
