import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import * as ctrl from './distributed.controller';

const router = Router();

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

adminRouter.get('/system/health', ctrl.getSystemHealth);
adminRouter.get('/system/queues', ctrl.getQueueHealth);
adminRouter.get('/system/dead-letters', ctrl.getDeadLetters);
adminRouter.get('/system/dead-letters/stats', ctrl.getDeadLetterStats);
adminRouter.post('/system/dead-letters/:id/retry', ctrl.retryDeadLetter);
adminRouter.post('/system/dead-letters/:id/resolve', ctrl.resolveDeadLetter);

router.use('/admin', adminRouter);

export default router;
