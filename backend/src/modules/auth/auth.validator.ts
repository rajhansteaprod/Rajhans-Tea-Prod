import { z } from 'zod';

export const firebaseTokenSchema = z.object({
  body: z.object({
    idToken: z.string().min(1, 'Firebase ID token is required'),
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});
