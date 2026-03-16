import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { authorize } from '../../../middleware/rbac.middleware';
import { validate } from '../../../middleware/validate.middleware';
import { listUsersSchema } from '../validators/admin-user.validator';
import * as adminUserController from '../controllers/admin-user.controller';
import * as adminDashboardController from '../controllers/admin-dashboard.controller';

const router = Router();

// All admin routes require authentication + admin role
router.use(authenticate);
router.use(authorize('admin'));

// Dashboard
router.get('/admin/dashboard/stats', adminDashboardController.getDashboardStats);

// User management
router.get('/admin/users', validate(listUsersSchema), adminUserController.listUsers);

export default router;
