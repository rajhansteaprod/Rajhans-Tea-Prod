import { z } from 'zod';

export const subscribeSchema = z.object({
  body: z.object({
    email: z
      .string({ required_error: 'Email is required' })
      .email('Please provide a valid email address')
      .min(1, 'Email is required'),
  }),
  query: z.object({}).passthrough().optional(),
  params: z.object({}).passthrough().optional(),
});
