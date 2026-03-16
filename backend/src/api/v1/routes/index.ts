import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import adminRoutes from './admin.routes';

const router = Router();

router.use(healthRoutes);
router.use(authRoutes);
router.use(adminRoutes);

export default router;
