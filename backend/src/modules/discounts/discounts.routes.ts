import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import * as ctrl from './controllers/discount.controller';

const router = Router();

// PUBLIC
router.post('/discounts/validate-promo', ctrl.validatePromoCode);
router.get('/discounts/offers', ctrl.getApplicableOffers);
router.post('/discounts/apply', ctrl.getDiscountForCart);

// ADMIN
const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

adminRouter.get('/discounts', ctrl.adminListDiscounts);
adminRouter.post('/discounts/promo-codes', ctrl.adminCreatePromoCode);
adminRouter.post('/discounts/offers', ctrl.adminCreateOffer);
adminRouter.get('/discounts/:id', ctrl.adminGetDiscount);
adminRouter.put('/discounts/:id', ctrl.adminUpdateDiscount);
adminRouter.delete('/discounts/:id', ctrl.adminDeleteDiscount);

router.use('/admin', adminRouter);

export default router;
