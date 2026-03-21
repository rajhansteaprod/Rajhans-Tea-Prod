import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import * as ctrl from './integrations.controller';

const router = Router();

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

adminRouter.get('/integrations/health', ctrl.getIntegrationHealth);
adminRouter.get('/integrations/webhooks', ctrl.listWebhooks);
adminRouter.get('/integrations/webhooks/events', ctrl.getAvailableEvents);
adminRouter.post('/integrations/webhooks', ctrl.createWebhook);
adminRouter.put('/integrations/webhooks/:id', ctrl.updateWebhook);
adminRouter.patch('/integrations/webhooks/:id/toggle', ctrl.toggleWebhook);
adminRouter.post('/integrations/webhooks/:id/test', ctrl.testWebhook);
adminRouter.delete('/integrations/webhooks/:id', ctrl.deleteWebhook);

router.use('/admin', adminRouter);

export default router;
