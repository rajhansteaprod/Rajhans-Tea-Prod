import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../../middleware/validate.middleware';
import * as newsletter from './newsletter.controller';
import { subscribeSchema } from './newsletter.validator';

const router = Router();

// ===========================================================================
// NEWSLETTER — PUBLIC (no authentication required)
// ===========================================================================

/**
 * POST /api/v1/newsletter/subscribe
 * Subscribe email to newsletter
 * Frontend: validates email + spam check locally
 * Backend: validates again + prevents duplicates + stores in DB
 */
router.post(
  '/newsletter/subscribe',
  validate(subscribeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await newsletter.subscribe(req, res);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/newsletter/unsubscribe
 * Unsubscribe email from newsletter (optional endpoint for future use)
 */
router.post(
  '/newsletter/unsubscribe',
  validate(subscribeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await newsletter.unsubscribe(req, res);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
