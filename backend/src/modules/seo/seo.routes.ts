import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import * as ctrl from './seo.controller';

const router = Router();

// All SEO endpoints are admin-only and read-only with respect to production SEO.
const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

adminRouter.post('/seo/audit', ctrl.triggerAudit);
adminRouter.get('/seo/runs', ctrl.getRuns);
adminRouter.get('/seo/runs/:id', ctrl.getRun);
adminRouter.get('/seo/runs/:id/issues', ctrl.getIssues);
adminRouter.get('/seo/checks', ctrl.getChecks);
adminRouter.get('/seo/recommendations', ctrl.getRecommendations);
adminRouter.get('/seo/gsc/summary', ctrl.getGscSummary);
adminRouter.post('/seo/gsc/sync', ctrl.triggerGscSync);

router.use('/admin', adminRouter);

export default router;
