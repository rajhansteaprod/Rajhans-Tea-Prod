import { Router } from 'express';
import { validatePromoCode, calculateDiscount } from './promo.controller';

const router = Router();

// Public endpoints (validation done in controller)
router.post('/promo/validate', validatePromoCode);
router.post('/promo/calculate-discount', calculateDiscount);

export default router;
