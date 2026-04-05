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

// ── Profile & Address Schemas ────────────────────────────────────────────────

export const updateProfileSchema = z.object({
  body: z.object({
    firstName: z.string().trim().min(1, 'First name cannot be empty').max(50).optional(),
    lastName: z.string().trim().min(1, 'Last name cannot be empty').max(50).optional(),
    email: z.string().trim().email('Invalid email address').optional(),
  }).refine(
    (data) => data.firstName !== undefined || data.lastName !== undefined || data.email !== undefined,
    { message: 'At least one field (firstName, lastName, email) must be provided' },
  ),
});

const addressBodySchema = z.object({
  label: z.string().trim().min(1, 'Label is required').max(50),
  street: z.string().trim().min(1, 'Street is required').max(200),
  city: z.string().trim().min(1, 'City is required').max(100),
  state: z.string().trim().min(1, 'State is required').max(100),
  postalCode: z.string().trim().regex(/^\d{6}$/, 'Postal code must be 6 digits'),
  country: z.string().trim().min(1).max(100).optional().default('India'),
  isDefault: z.boolean().optional().default(false),
});

export const createAddressSchema = z.object({
  body: addressBodySchema,
});

export const updateAddressSchema = z.object({
  params: z.object({
    addressId: z.string().min(1, 'Address ID is required'),
  }),
  body: addressBodySchema.partial().refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field must be provided' },
  ),
});

export const addressIdParamSchema = z.object({
  params: z.object({
    addressId: z.string().min(1, 'Address ID is required'),
  }),
});
