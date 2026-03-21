import { z } from 'zod';

const mongoId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID');

export const notificationIdSchema = z.object({ params: z.object({ id: mongoId }) });

export const registerFcmTokenSchema = z.object({
  body: z.object({
    token: z.string().min(1),
    deviceInfo: z.string().optional(),
  }),
});

export const unregisterFcmTokenSchema = z.object({
  body: z.object({ token: z.string().min(1) }),
});

export const updatePreferencesSchema = z.object({
  body: z.object({
    preferences: z.record(z.object({ email: z.boolean(), sms: z.boolean(), push: z.boolean() })).optional(),
    quietHoursStart: z.number().int().min(0).max(23).nullable().optional(),
    quietHoursEnd: z.number().int().min(0).max(23).nullable().optional(),
  }),
});

export const sendBulkSchema = z.object({
  body: z.object({
    type: z.string().min(1),
    message: z.string().min(1).max(1000),
    targetRole: z.string().optional(),
  }),
});

export const createTemplateSchema = z.object({
  body: z.object({
    type: z.string().min(1).max(50),
    channels: z.object({
      email: z.object({ subject: z.string(), htmlBody: z.string() }).nullable().optional(),
      sms: z.object({ body: z.string().max(160) }).nullable().optional(),
      push: z.object({ title: z.string(), body: z.string() }).nullable().optional(),
    }),
    variables: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
  }),
});
