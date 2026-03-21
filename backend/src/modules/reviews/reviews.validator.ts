import { z } from 'zod';

const mongoId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID');

export const productIdSchema = z.object({ params: z.object({ productId: mongoId }) });
export const reviewIdSchema = z.object({ params: z.object({ reviewId: mongoId }) });
export const questionIdSchema = z.object({ params: z.object({ questionId: mongoId }) });

export const submitReviewSchema = z.object({
  params: z.object({ productId: mongoId }),
  body: z.object({
    rating: z.number({ coerce: true }).int().min(1).max(5),
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(5000),
    images: z.array(z.string()).max(5).optional(),
  }),
});

export const submitQuestionSchema = z.object({
  params: z.object({ productId: mongoId }),
  body: z.object({
    questionText: z.string().min(1).max(1000),
  }),
});

export const submitAnswerSchema = z.object({
  params: z.object({ questionId: mongoId }),
  body: z.object({
    body: z.string().min(1).max(5000),
  }),
});

export const reportSchema = z.object({
  params: z.object({ reviewId: mongoId }),
  body: z.object({
    reason: z.enum(['spam', 'inappropriate', 'fake', 'other']),
    details: z.string().max(500).optional(),
  }),
});

export const adminReplySchema = z.object({
  params: z.object({ id: mongoId }),
  body: z.object({
    body: z.string().min(1).max(2000),
  }),
});

export const rejectSchema = z.object({
  params: z.object({ id: mongoId }),
  body: z.object({
    reason: z.string().min(1).max(500),
  }),
});
