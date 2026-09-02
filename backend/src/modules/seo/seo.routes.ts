import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import * as ctrl from './seo.controller';

const router = Router();

// All SEO endpoints are admin-only. Exactly TWO routes below are permitted to
// write live SEO metadata (CMS Page metaTitle/metaDescription), each only after
// re-checking eligibility server-side:
//   - Phase 5.3  POST .../change-drafts/:draftId/execute   (writes the approved
//     draft's proposed values)
//   - Phase 5.4B POST .../change-executions/:executionId/rollback (restores the
//     values that execution captured in its immutable `before` snapshot)
// Every other SEO route is non-mutating with respect to production SEO/content.
// In particular, Phase 5.4A verification and Phase 5.4B completion only ever
// create their own immutable forensic records (SeoChangeVerification /
// SeoChangeCompletion) — they never touch Page, and never write
// SeoRecommendation.status/resolvedRunId, which stay machine/evidence owned.
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
adminRouter.post('/seo/change-executions/:executionId/complete', ctrl.completeChangeExecution);
adminRouter.get('/seo/change-executions/:executionId/completions', ctrl.getChangeExecutionCompletions);
adminRouter.get('/seo/change-completions/:completionId', ctrl.getChangeCompletion);
adminRouter.post('/seo/change-executions/:executionId/rollback', ctrl.rollbackChangeExecution);
adminRouter.get('/seo/change-executions/:executionId/rollbacks', ctrl.getChangeExecutionRollbacks);
adminRouter.get('/seo/change-rollbacks/:rollbackId', ctrl.getChangeRollback);
adminRouter.get('/seo/gsc/summary', ctrl.getGscSummary);
adminRouter.post('/seo/gsc/sync', ctrl.triggerGscSync);

router.use('/admin', adminRouter);

export default router;
