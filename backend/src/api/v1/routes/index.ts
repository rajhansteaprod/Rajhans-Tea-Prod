import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import adminRoutes from './admin.routes';
import catalogRoutes from './catalog.routes';
import pricingRoutes from './pricing.routes';
import cartRoutes from './cart.routes';
import paymentRoutes from './payment.routes';
import inventoryRoutes from '../../../modules/inventory/inventory.routes';

const router = Router();

router.use(healthRoutes);
router.use(authRoutes);
router.use(adminRoutes);
router.use(catalogRoutes);
router.use(pricingRoutes);
router.use(cartRoutes);
router.use(paymentRoutes);
router.use(inventoryRoutes);

export default router;
