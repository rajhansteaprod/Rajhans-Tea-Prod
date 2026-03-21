import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import * as ctrl from './analytics.controller';

const router = Router();

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

// Basic analytics (Slice 17)
adminRouter.get('/analytics/dashboard', ctrl.getDashboard);
adminRouter.get('/analytics/revenue', ctrl.getRevenueChart);
adminRouter.get('/analytics/customers', ctrl.getCustomerAcquisition);
adminRouter.get('/analytics/funnel', ctrl.getConversionFunnel);

// Intelligence (Slice 14)
adminRouter.get('/analytics/segmentation', ctrl.getUserSegmentation);
adminRouter.get('/analytics/forecast', ctrl.getRevenueForecast);
adminRouter.get('/analytics/kpi-comparison', ctrl.getKPIComparison);
adminRouter.get('/analytics/product-performance', ctrl.getProductPerformance);
adminRouter.get('/analytics/churn-risk', ctrl.getChurnRisk);
adminRouter.get('/analytics/cohorts', ctrl.getCohortAnalysis);
adminRouter.get('/analytics/realtime', ctrl.getRealTimeStats);

// Exports
adminRouter.get('/export/orders', ctrl.exportOrders);
adminRouter.get('/export/users', ctrl.exportUsers);
adminRouter.get('/export/products', ctrl.exportProducts);

router.use('/admin', adminRouter);

export default router;
