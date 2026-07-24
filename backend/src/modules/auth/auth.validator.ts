import { z } from 'zod';

export const firebaseTokenSchema = z.object({
  body: z.object({
    idToken: z.string().min(1, 'Firebase ID token is required'),
  }),
});

// OTP send and verify schemas (MSG91-based authentication)
export const sendOtpSchema = z.object({
  body: z.object({
    phone: z.string().regex(/^\d{10}$/, 'Phone number must be 10 digits'),
  }),
});

export const verifyOtpSchema = z.object({
  body: z.object({
    phone: z.string().regex(/^\d{10}$/, 'Phone number must be 10 digits'),
    otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
  }),
});

export const resendOtpSchema = z.object({
  body: z.object({
    phone: z.string().regex(/^\d{10}$/, 'Phone number must be 10 digits'),
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
  name: z.string().trim().max(100).optional(),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Phone number must be 10 digits').optional(),
  address: z.string().trim().min(1, 'Address is required').max(200),
  landmark: z.string().trim().max(100).optional(),
  city: z.string().trim().min(1, 'City is required').max(100),
  state: z.string().trim().min(1, 'State is required').max(100),
  pinCode: z.string().trim().regex(/^\d{6}$/, 'PIN code must be 6 digits'),
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
