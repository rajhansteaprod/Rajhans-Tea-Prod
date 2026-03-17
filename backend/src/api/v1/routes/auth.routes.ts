import { Router } from 'express';
import { validate } from '../../../middleware/validate.middleware';
import { authenticate } from '../../../middleware/auth.middleware';
import { authRateLimiter } from '../../../middleware/rate-limit.middleware';
import {
  firebaseTokenSchema,
  refreshTokenSchema,
} from '../validators/auth.validator';
import * as authController from '../controllers/auth.controller';

const router = Router();

router.post('/auth/verify-token', authRateLimiter, validate(firebaseTokenSchema), authController.verifyFirebaseToken);
router.post('/auth/refresh-token', authRateLimiter, validate(refreshTokenSchema), authController.refreshToken);
router.post('/auth/logout', authController.logout);
router.post('/auth/logout-all', authenticate, authController.logoutAll);
router.get('/auth/me', authenticate, authController.me);

export default router;
