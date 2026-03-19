import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import adminRoutes from './admin.routes';
import catalogRoutes from './catalog.routes';
import pricingRoutes from './pricing.routes';

const router = Router();

router.use(healthRoutes);
router.use(authRoutes);
router.use(adminRoutes);
router.use(catalogRoutes);
router.use(pricingRoutes);

export default router;
