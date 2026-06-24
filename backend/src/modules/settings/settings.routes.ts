import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import * as ctrl from './settings.controller';

const router = Router();

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

adminRouter.get('/settings', ctrl.getSettings);
adminRouter.put('/settings', ctrl.updateSettings);

// Public routes
router.get('/catalog/homepage-sections', ctrl.getHomepageSectionsPublic);

router.use('/admin', adminRouter);

export default router;
