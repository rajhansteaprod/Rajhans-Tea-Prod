import { z } from 'zod';

const mongoIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid session ID');

/** Validates :sessionId route param for DELETE /auth/sessions/:sessionId */
export const revokeSessionSchema = z.object({
  params: z.object({
    sessionId: mongoIdSchema,
  }),
});

/** Validates :userId route param for admin endpoints */
export const userIdParamSchema = z.object({
  params: z.object({
    userId: mongoIdSchema,
  }),
});

/** Validates both :userId and :sessionId for DELETE /admin/sessions/:sessionId */
export const adminRevokeSessionSchema = z.object({
  params: z.object({
    sessionId: mongoIdSchema,
  }),
});
