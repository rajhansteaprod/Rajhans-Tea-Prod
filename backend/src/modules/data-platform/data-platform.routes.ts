import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import * as ctrl from './data-platform.controller';

const router = Router();

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

adminRouter.get('/data-platform', ctrl.getDataPlatformDashboard);
adminRouter.post('/data-platform/backup', ctrl.triggerBackup);
adminRouter.post('/data-platform/archive', ctrl.triggerArchive);
adminRouter.post('/data-platform/schedule-backup', ctrl.scheduleBackup);

router.use('/admin', adminRouter);

export default router;
