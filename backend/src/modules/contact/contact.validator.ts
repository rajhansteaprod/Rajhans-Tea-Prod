import { z } from 'zod';

export const contactSubmitSchema = z.object({
  body: z.object({
    fullName: z.string().trim().min(1, 'Full name is required'),
    mobileNumber: z.string()
      .regex(/^\d{10}$|^\d{12}$/, 'Mobile number must be 10 or 12 digits'),
    emailAddress: z.string().email('Email must be valid'),
    address: z.string().trim().optional(),
    reasonToContact: z.enum(['help', 'bulk', 'gifting']),
    message: z.string().trim().optional(),
    companyName: z.string().trim().optional(),
    preferredDeliveryDate: z.string().optional(),
  }),
});

export const updateSubmissionSchema = z.object({
  body: z.object({
    status: z.enum(['new', 'contacted', 'resolved']),
    internalNotes: z.string().trim().optional(),
  }),
});
