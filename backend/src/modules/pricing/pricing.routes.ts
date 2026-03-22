import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  calculatePriceSchema,
  createPriceRuleSchema,
  updatePriceRuleSchema,
  priceRuleIdSchema,
  createTaxRuleSchema,
  updateTaxRuleSchema,
  taxRuleIdSchema,
} from './pricing.validator';
import {
  calculatePrice,
  listPriceRules,
  getPriceRule,
  createPriceRule,
  updatePriceRule,
  deletePriceRule,
  listTaxRules,
  getTaxRule,
  createTaxRule,
  updateTaxRule,
  deleteTaxRule,
} from './pricing.controller';

const router = Router();

// ─── Public: Calculate price (used by product pages, cart, etc.) ──────────────
// POST /api/v1/pricing/calculate
router.post('/pricing/calculate', validate(calculatePriceSchema), calculatePrice);

// ─── Admin: Price Rules (requires admin auth) ─────────────────────────────────
const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

adminRouter
  .route('/pricing/rules')
  .get(listPriceRules)
  .post(validate(createPriceRuleSchema), createPriceRule);

adminRouter
  .route('/pricing/rules/:id')
  .get(validate(priceRuleIdSchema), getPriceRule)
  .put(validate(updatePriceRuleSchema), updatePriceRule)
  .delete(validate(priceRuleIdSchema), deletePriceRule);

// ─── Admin: Tax Rules ─────────────────────────────────────────────────────────
adminRouter
  .route('/pricing/tax-rules')
  .get(listTaxRules)
  .post(validate(createTaxRuleSchema), createTaxRule);

adminRouter
  .route('/pricing/tax-rules/:id')
  .get(validate(taxRuleIdSchema), getTaxRule)
  .put(validate(updateTaxRuleSchema), updateTaxRule)
  .delete(validate(taxRuleIdSchema), deleteTaxRule);

router.use('/admin', adminRouter);

export default router;
