import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  listUsersSchema,
  createUserSchema,
  updateUserSchema,
  banUserSchema,
  userIdSchema,
} from './admin-user.validator';
import { userIdParamSchema, adminRevokeSessionSchema } from '../auth/session.validator';
import * as adminUserController from './admin-user.controller';
import * as adminDashboardController from './admin-dashboard.controller';
import * as adminSessionController from './admin-session.controller';

const router = Router();

// All admin routes require authentication + admin role
// Path-scoped so it only runs for /admin/* — not for public routes in other routers
router.use('/admin', authenticate);
router.use('/admin', authorize('admin'));

// Dashboard
router.get('/admin/dashboard/stats', adminDashboardController.getDashboardStats);

// User management
router.get('/admin/users', validate(listUsersSchema), adminUserController.listUsers);
router.post('/admin/users', validate(createUserSchema), adminUserController.createUser);
router.put('/admin/users/:userId', validate(updateUserSchema), adminUserController.updateUser);
router.delete('/admin/users/:userId', validate(userIdSchema), adminUserController.deleteUser);
router.patch('/admin/users/:userId/ban', validate(banUserSchema), adminUserController.banUser);
router.patch('/admin/users/:userId/unban', validate(userIdSchema), adminUserController.unbanUser);

// Session management (admin can view + revoke any user's sessions)
router.get(
  '/admin/users/:userId/sessions',
  validate(userIdParamSchema),
  adminSessionController.listUserSessions,
);
router.delete(
  '/admin/users/:userId/sessions',
  validate(userIdParamSchema),
  adminSessionController.revokeAllUserSessions,
);
router.delete(
  '/admin/sessions/:sessionId',
  validate(adminRevokeSessionSchema),
  adminSessionController.adminRevokeSession,
);

export default router;
