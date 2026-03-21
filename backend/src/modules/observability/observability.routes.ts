import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import * as ctrl from './observability.controller';

const router = Router();

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

adminRouter.get('/observability/dashboard', ctrl.getObservabilityDashboard);
adminRouter.get('/observability/latency', ctrl.getEndpointLatency);

router.use('/admin', adminRouter);

export default router;
