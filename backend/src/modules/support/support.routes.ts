import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import * as ctrl from './support.controller';

const router = Router();

// Customer (authenticated)
router.post('/support/tickets', authenticate, ctrl.createTicket);
router.get('/support/tickets', authenticate, ctrl.getMyTickets);
router.get('/support/tickets/:id', authenticate, ctrl.getMyTicket);
router.post('/support/tickets/:id/reply', authenticate, ctrl.replyToTicket);

// Admin
const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

adminRouter.get('/support/stats', ctrl.adminGetStats);
adminRouter.get('/support/tickets', ctrl.adminListTickets);
adminRouter.get('/support/tickets/:id', ctrl.adminGetTicket);
adminRouter.post('/support/tickets/:id/reply', ctrl.adminReply);
adminRouter.patch('/support/tickets/:id/status', ctrl.adminUpdateStatus);

router.use('/admin', adminRouter);

export default router;
