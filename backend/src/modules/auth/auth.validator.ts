import { z } from 'zod';

export const firebaseTokenSchema = z.object({
  body: z.object({
    idToken: z.string().min(1, 'Firebase ID token is required'),
  }),
});

// refreshToken comes from httpOnly cookie OR body (fallback)
// Both are optional at validation level — controller checks for either
export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1).optional(),
  }),
});
