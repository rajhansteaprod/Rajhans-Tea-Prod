import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.middleware';
import { authenticate } from '../../middleware/auth.middleware';
import { authRateLimiter } from '../../middleware/rate-limit.middleware';
import {
  firebaseTokenSchema,
  refreshTokenSchema,
  updateProfileSchema,
  createAddressSchema,
  updateAddressSchema,
  addressIdParamSchema,
  sendOtpSchema,
  verifyOtpSchema,
  resendOtpSchema,
} from './auth.validator';
import { revokeSessionSchema } from './session.validator';
import * as authController from './auth.controller';
import * as otpController from '../otp/otp.controller';
import * as sessionController from './session.controller';

const router = Router();

// Public auth endpoints (rate-limited)
router.post(
  '/auth/verify-msg91-token',
  authRateLimiter,
  validate(z.object({ body: z.object({ accessToken: z.string() }) })),
  authController.verifyMsg91Token,
);

router.post(
  '/auth/verify-token',
  authRateLimiter,
  validate(firebaseTokenSchema),
  authController.verifyFirebaseToken,
);

// OTP-based authentication endpoints
// Note: sendOtp, verifyOtp, resendOtp now handled by MSG91 Widget on client-side
// Backend only issues tokens after widget verification
router.post(
  '/auth/otp-login',
  authRateLimiter,
  validate(z.object({ body: z.object({ phone: z.string().regex(/^\d{10}$/, 'Phone number must be 10 digits') }) })),
  authController.loginViaOtp,
);

// Kept for backward compatibility (will be deprecated)
router.post(
  '/auth/send-otp',
  authRateLimiter,
  validate(sendOtpSchema),
  otpController.sendOtp,
);
router.post(
  '/auth/verify-otp',
  authRateLimiter,
  validate(verifyOtpSchema),
  otpController.verifyOtp,
);
router.post(
  '/auth/resend-otp',
  authRateLimiter,
  validate(resendOtpSchema),
  otpController.resendOtp,
);

router.post(
  '/auth/refresh-token',
  authRateLimiter,
  validate(refreshTokenSchema),
  authController.refreshToken,
);
router.post('/auth/logout', authController.logout);

// Authenticated-only auth endpoints
router.post('/auth/logout-all', authenticate, authController.logoutAll);
router.get('/auth/me', authenticate, authController.me);

// Profile update
router.put(
  '/auth/profile',
  authenticate,
  validate(updateProfileSchema),
  authController.updateProfile,
);

// Address CRUD
router.get('/auth/addresses', authenticate, authController.getAddresses);
router.post(
  '/auth/addresses',
  authenticate,
  validate(createAddressSchema),
  authController.addAddress,
);
router.put(
  '/auth/addresses/:addressId',
  authenticate,
  validate(updateAddressSchema),
  authController.updateAddress,
);
router.delete(
  '/auth/addresses/:addressId',
  authenticate,
  validate(addressIdParamSchema),
  authController.deleteAddress,
);
router.patch(
  '/auth/addresses/:addressId/default',
  authenticate,
  validate(addressIdParamSchema),
  authController.setDefaultAddress,
);

// Session management (authenticated user, own sessions only)
router.get('/auth/sessions', authenticate, sessionController.listSessions);
router.delete(
  '/auth/sessions/:sessionId',
  authenticate,
  validate(revokeSessionSchema),
  sessionController.revokeSession,
);

export default router;
