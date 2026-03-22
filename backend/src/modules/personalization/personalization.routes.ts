import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import * as ctrl from './personalization.controller';
import {
  trackViewSchema,
  productIdParamSchema,
  crossSellSchema,
  createRuleSchema,
  createBannerSchema,
} from './personalization.validator';

const router = Router();

// ===========================================================================
// PUBLIC
// ===========================================================================

router.get('/personalization/feed', ctrl.getHomepageFeed);
router.get('/personalization/trending', ctrl.getTrending);
router.get('/personalization/recently-viewed', ctrl.getRecentlyViewed);
router.post('/personalization/track-view', validate(trackViewSchema), ctrl.trackView);
router.get(
  '/personalization/product/:productId/recommendations',
  validate(productIdParamSchema),
  ctrl.getProductRecommendations,
);
router.get(
  '/personalization/product/:productId/upsell',
  validate(productIdParamSchema),
  ctrl.getUpsell,
);
router.get('/personalization/cart/cross-sell', validate(crossSellSchema), ctrl.getCrossSell);
router.get('/personalization/banners', ctrl.getBanners);

// ===========================================================================
// ADMIN
// ===========================================================================

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

// Rules
adminRouter.get('/merchandising/rules', ctrl.adminListRules);
adminRouter.post('/merchandising/rules', validate(createRuleSchema), ctrl.adminCreateRule);
adminRouter.put('/merchandising/rules/:id', ctrl.adminUpdateRule);
adminRouter.delete('/merchandising/rules/:id', ctrl.adminDeleteRule);
adminRouter.post('/merchandising/rules/:id/evaluate', ctrl.adminEvaluateRule);

// Banners
adminRouter.get('/merchandising/banners', ctrl.adminListBanners);
adminRouter.post('/merchandising/banners', validate(createBannerSchema), ctrl.adminCreateBanner);
adminRouter.put('/merchandising/banners/:id', ctrl.adminUpdateBanner);
adminRouter.delete('/merchandising/banners/:id', ctrl.adminDeleteBanner);

router.use('/admin', adminRouter);

export default router;
