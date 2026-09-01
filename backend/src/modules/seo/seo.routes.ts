import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import * as ctrl from './seo.controller';

const router = Router();

// All SEO endpoints are admin-only. Audit/recommendation/review/change-draft/
// change-verification routes below are non-mutating with respect to
// production SEO/content — verification only ever creates its own immutable
// SeoChangeVerification record, never touching Page or any other collection.
// The sole exception is Phase 5.3's POST .../change-drafts/:draftId/execute,
// which is the only route permitted to write whitelisted live SEO metadata
// (CMS Page metaTitle/metaDescription) after re-checking eligibility server-side.
const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

adminRouter.post('/seo/audit', ctrl.triggerAudit);
adminRouter.get('/seo/runs', ctrl.getRuns);
adminRouter.get('/seo/runs/:id', ctrl.getRun);
adminRouter.get('/seo/runs/:id/issues', ctrl.getIssues);
adminRouter.get('/seo/checks', ctrl.getChecks);
adminRouter.get('/seo/recommendations', ctrl.getRecommendations);
adminRouter.patch('/seo/recommendations/:id/review', ctrl.reviewRecommendation);
adminRouter.post('/seo/recommendations/:id/draft', ctrl.generateRecommendationDraft);
adminRouter.get('/seo/recommendations/:id/drafts', ctrl.getRecommendationDraftHistory);
adminRouter.get('/seo/change-drafts/:draftId', ctrl.getChangeDraft);
adminRouter.post('/seo/change-drafts/:draftId/execute', ctrl.executeChangeDraft);
adminRouter.get('/seo/change-drafts/:draftId/executions', ctrl.getChangeDraftExecutions);
adminRouter.get('/seo/change-executions/:executionId', ctrl.getChangeExecution);
adminRouter.post('/seo/change-executions/:executionId/verify', ctrl.verifyChangeExecution);
adminRouter.get('/seo/change-executions/:executionId/verifications', ctrl.getChangeExecutionVerifications);
adminRouter.get('/seo/change-verifications/:verificationId', ctrl.getChangeVerification);
adminRouter.get('/seo/gsc/summary', ctrl.getGscSummary);
adminRouter.post('/seo/gsc/sync', ctrl.triggerGscSync);

router.use('/admin', adminRouter);

export default router;
