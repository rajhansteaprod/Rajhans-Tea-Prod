import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import * as ctrl from './promotions.controller';
import {
  validateCouponSchema,
  createCouponSchema,
  updateCouponSchema,
  couponIdSchema,
  createCampaignSchema,
  loyaltySettingsSchema,
  referralSettingsSchema,
} from './promotions.validator';

const router = Router();

// ===========================================================================
// PUBLIC
// ===========================================================================

router.get('/promotions/campaigns/active', ctrl.getActiveCampaigns);
router.post('/promotions/coupons/validate', validate(validateCouponSchema), ctrl.validateCoupon);

// ===========================================================================
// AUTHENTICATED
// ===========================================================================

router.get('/promotions/loyalty', authenticate, ctrl.getLoyaltyAccount);
router.get('/promotions/referral/code', authenticate, ctrl.getReferralCode);

// ===========================================================================
// ADMIN
// ===========================================================================

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

// Coupons
adminRouter.get('/promotions/coupons', ctrl.adminListCoupons);
adminRouter.post('/promotions/coupons', validate(createCouponSchema), ctrl.adminCreateCoupon);
adminRouter.put('/promotions/coupons/:id', validate(updateCouponSchema), ctrl.adminUpdateCoupon);
adminRouter.delete('/promotions/coupons/:id', validate(couponIdSchema), ctrl.adminDeleteCoupon);

// Campaigns
adminRouter.get('/promotions/campaigns', ctrl.adminListCampaigns);
adminRouter.post('/promotions/campaigns', validate(createCampaignSchema), ctrl.adminCreateCampaign);
adminRouter.put('/promotions/campaigns/:id', ctrl.adminUpdateCampaign);
adminRouter.delete('/promotions/campaigns/:id', ctrl.adminDeleteCampaign);

// Loyalty
adminRouter.get('/promotions/loyalty/settings', ctrl.adminGetLoyaltySettings);
adminRouter.put(
  '/promotions/loyalty/settings',
  validate(loyaltySettingsSchema),
  ctrl.adminUpdateLoyaltySettings,
);

// Referrals
adminRouter.get('/promotions/referral/settings', ctrl.adminGetReferralSettings);
adminRouter.put(
  '/promotions/referral/settings',
  validate(referralSettingsSchema),
  ctrl.adminUpdateReferralSettings,
);
adminRouter.get('/promotions/referral/list', ctrl.adminListReferrals);

router.use('/admin', adminRouter);

export default router;
