import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import * as ctrl from './audit.controller';

const router = Router();

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

adminRouter.get('/audit-logs', ctrl.getAuditLogs);
adminRouter.get('/audit-logs/recent', ctrl.getRecentActivity);

router.use('/admin', adminRouter);

export default router;
