import { Router } from 'express';
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
} from './auth.validator';
import { revokeSessionSchema } from './session.validator';
import * as authController from './auth.controller';
import * as sessionController from './session.controller';

const router = Router();

// Public auth endpoints (rate-limited)
router.post(
  '/auth/verify-token',
  authRateLimiter,
  validate(firebaseTokenSchema),
  authController.verifyFirebaseToken,
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
