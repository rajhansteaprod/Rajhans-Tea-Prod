import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import * as ctrl from './feature-flag.controller';

const router = Router();

// Public — evaluate flags (works with or without auth)
router.get('/feature-flags', ctrl.evaluateFlags);
router.get('/feature-flags/:slug', ctrl.checkFlag);

// Admin CRUD
const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

adminRouter.get('/feature-flags', ctrl.listFlags);
adminRouter.post('/feature-flags', ctrl.createFlag);
adminRouter.put('/feature-flags/:id', ctrl.updateFlag);
adminRouter.patch('/feature-flags/:id/toggle', ctrl.toggleFlag);
adminRouter.delete('/feature-flags/:id', ctrl.deleteFlag);

router.use('/admin', adminRouter);

export default router;
