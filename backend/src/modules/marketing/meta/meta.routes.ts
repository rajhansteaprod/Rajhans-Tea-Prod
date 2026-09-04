import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateOptional } from '../../../middleware/auth.middleware';
import { trackBeacon } from './meta.controller';

const router = Router();

// Public browser beacon — dedicated limiter (fires during normal browsing).
const beaconLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

// authenticateOptional populates req.user when a valid token is present, so PII
// can come from the session for logged-in users; anonymous requests continue.
router.post('/catalog/meta/track', beaconLimiter, authenticateOptional, trackBeacon);

export default router;
