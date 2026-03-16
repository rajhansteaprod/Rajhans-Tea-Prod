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
