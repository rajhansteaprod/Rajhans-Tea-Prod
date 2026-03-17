import { Router } from 'express';
import { validate } from '../../../middleware/validate.middleware';
import { authenticate } from '../../../middleware/auth.middleware';
import { authRateLimiter } from '../../../middleware/rate-limit.middleware';
import {
  firebaseTokenSchema,
  refreshTokenSchema,
} from '../validators/auth.validator';
import {
  revokeSessionSchema,
} from '../validators/session.validator';
import * as authController    from '../controllers/auth.controller';
import * as sessionController from '../controllers/session.controller';

const router = Router();

// Public auth endpoints (rate-limited)
router.post('/auth/verify-token',  authRateLimiter, validate(firebaseTokenSchema),  authController.verifyFirebaseToken);
router.post('/auth/refresh-token', authRateLimiter, validate(refreshTokenSchema),   authController.refreshToken);
router.post('/auth/logout',        authController.logout);

// Authenticated-only auth endpoints
router.post('/auth/logout-all',    authenticate, authController.logoutAll);
router.get('/auth/me',             authenticate, authController.me);

// Session management (authenticated user, own sessions only)
router.get('/auth/sessions',                             authenticate, sessionController.listSessions);
router.delete('/auth/sessions/:sessionId', authenticate, validate(revokeSessionSchema), sessionController.revokeSession);

export default router;
