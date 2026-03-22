import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import * as ctrl from './communication.controller';
import {
  notificationIdSchema,
  registerFcmTokenSchema,
  unregisterFcmTokenSchema,
  updatePreferencesSchema,
  sendBulkSchema,
  createTemplateSchema,
} from './communication.validator';

const router = Router();

// ===========================================================================
// AUTHENTICATED — User notifications
// ===========================================================================

router.get('/notifications', authenticate, ctrl.getInbox);
router.get('/notifications/unread-count', authenticate, ctrl.getUnreadCount);
router.patch(
  '/notifications/:id/read',
  authenticate,
  validate(notificationIdSchema),
  ctrl.markRead,
);
router.patch('/notifications/read-all', authenticate, ctrl.markAllRead);
router.get('/notifications/preferences', authenticate, ctrl.getPreferences);
router.put(
  '/notifications/preferences',
  authenticate,
  validate(updatePreferencesSchema),
  ctrl.updatePreferences,
);
router.post(
  '/notifications/fcm-token',
  authenticate,
  validate(registerFcmTokenSchema),
  ctrl.registerFcmToken,
);
router.delete(
  '/notifications/fcm-token',
  authenticate,
  validate(unregisterFcmTokenSchema),
  ctrl.unregisterFcmToken,
);

// ===========================================================================
// ADMIN
// ===========================================================================

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

adminRouter.get('/notifications/stats', ctrl.adminGetStats);
adminRouter.post('/notifications/send-bulk', validate(sendBulkSchema), ctrl.adminSendBulk);
adminRouter.get('/notifications/templates', ctrl.adminListTemplates);
adminRouter.post(
  '/notifications/templates',
  validate(createTemplateSchema),
  ctrl.adminCreateTemplate,
);
adminRouter.put('/notifications/templates/:id', ctrl.adminUpdateTemplate);
adminRouter.delete('/notifications/templates/:id', ctrl.adminDeleteTemplate);

router.use('/admin', adminRouter);

export default router;
