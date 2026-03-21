import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import adminRoutes from './admin.routes';
import catalogRoutes from './catalog.routes';
import pricingRoutes from './pricing.routes';
import cartRoutes from './cart.routes';
import paymentRoutes from './payment.routes';
import inventoryRoutes from '../../../modules/inventory/inventory.routes';
import promotionsRoutes from '../../../modules/promotions/promotions.routes';
import searchRoutes from '../../../modules/search/search.routes';
import personalizationRoutes from '../../../modules/personalization/personalization.routes';
import reviewsRoutes from '../../../modules/reviews/reviews.routes';
import communicationRoutes from '../../../modules/communication/communication.routes';
import auditRoutes from '../../../modules/audit/audit.routes';
import analyticsRoutes from '../../../modules/analytics/analytics.routes';
import settingsRoutes from '../../../modules/settings/settings.routes';

const router = Router();

router.use(healthRoutes);
router.use(authRoutes);
router.use(adminRoutes);
router.use(catalogRoutes);
router.use(pricingRoutes);
router.use(cartRoutes);
router.use(paymentRoutes);
router.use(inventoryRoutes);
router.use(promotionsRoutes);
router.use(searchRoutes);
router.use(personalizationRoutes);
router.use(reviewsRoutes);
router.use(communicationRoutes);
router.use(auditRoutes);
router.use(analyticsRoutes);
router.use(settingsRoutes);

export default router;
