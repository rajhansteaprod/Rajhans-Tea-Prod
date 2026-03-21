import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import * as ctrl from './reviews.controller';
import {
  productIdSchema,
  reviewIdSchema,
  questionIdSchema,
  submitReviewSchema,
  submitQuestionSchema,
  submitAnswerSchema,
  reportSchema,
  adminReplySchema,
  rejectSchema,
} from './reviews.validator';

const router = Router();

// ===========================================================================
// PUBLIC
// ===========================================================================

router.get('/reviews/products/:productId/reviews', validate(productIdSchema), ctrl.getProductReviews);
router.get('/reviews/products/:productId/summary', validate(productIdSchema), ctrl.getRatingSummary);
router.get('/reviews/products/:productId/qa', validate(productIdSchema), ctrl.getProductQA);

// ===========================================================================
// AUTHENTICATED
// ===========================================================================

router.post('/reviews/products/:productId/reviews', authenticate, validate(submitReviewSchema), ctrl.submitReview);
router.delete('/reviews/reviews/:reviewId', authenticate, validate(reviewIdSchema), ctrl.deleteReview);
router.post('/reviews/reviews/:reviewId/vote', authenticate, validate(reviewIdSchema), ctrl.voteHelpful);
router.post('/reviews/reviews/:reviewId/report', authenticate, validate(reportSchema), ctrl.reportReview);
router.post('/reviews/products/:productId/questions', authenticate, validate(submitQuestionSchema), ctrl.submitQuestion);
router.post('/reviews/questions/:questionId/answers', authenticate, validate(submitAnswerSchema), ctrl.submitAnswer);
router.post('/reviews/questions/:questionId/vote', authenticate, validate(questionIdSchema), ctrl.voteQuestion);
router.get('/reviews/my-reviews', authenticate, ctrl.getMyReviews);

// ===========================================================================
// ADMIN
// ===========================================================================

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

adminRouter.get('/reviews/moderation', ctrl.adminGetModeration);
adminRouter.patch('/reviews/reviews/:id/approve', ctrl.adminApproveReview);
adminRouter.patch('/reviews/reviews/:id/reject', validate(rejectSchema), ctrl.adminRejectReview);
adminRouter.post('/reviews/reviews/:id/reply', validate(adminReplySchema), ctrl.adminReplyToReview);
adminRouter.patch('/reviews/reviews/:id/pin', ctrl.adminPinReview);
adminRouter.patch('/reviews/questions/:id/approve', ctrl.adminApproveQuestion);
adminRouter.patch('/reviews/questions/:id/reject', ctrl.adminRejectQuestion);
adminRouter.get('/reviews/analytics', ctrl.adminGetAnalytics);
adminRouter.get('/reviews/reported', ctrl.adminGetReported);

router.use('/admin', adminRouter);

export default router;
