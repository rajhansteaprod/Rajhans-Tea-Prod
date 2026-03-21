import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import * as ctrl from './analytics.controller';

const router = Router();

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

adminRouter.get('/analytics/dashboard', ctrl.getDashboard);
adminRouter.get('/analytics/revenue', ctrl.getRevenueChart);
adminRouter.get('/analytics/customers', ctrl.getCustomerAcquisition);
adminRouter.get('/analytics/funnel', ctrl.getConversionFunnel);

router.use('/admin', adminRouter);

export default router;
