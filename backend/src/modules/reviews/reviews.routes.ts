import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  upload,
  uploadTimeoutMiddleware,
  uploadErrorHandler,
} from '../../middleware/upload.middleware';
import { requireValidReviewToken } from './middleware/review-token.guard';
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
  adminCreateReviewSchema,
  reviewTokenParamSchema,
  tokenReviewSchema,
} from './reviews.validator';

const router = Router();

// ===========================================================================
// PUBLIC
// ===========================================================================

router.get(
  '/reviews/products/:productId/reviews',
  validate(productIdSchema),
  ctrl.getProductReviews,
);
router.get(
  '/reviews/products/:productId/summary',
  validate(productIdSchema),
  ctrl.getRatingSummary,
);
router.get('/reviews/products/:productId/qa', validate(productIdSchema), ctrl.getProductQA);
// Batch rating summaries for listing pages (?productIds=id1,id2,...)
router.get('/reviews/summaries', ctrl.getRatingSummaries);

// ===========================================================================
// ANONYMOUS ORDER-TOKEN REVIEWS (no auth — the token proves the purchase)
// ===========================================================================

router.get('/reviews/token/:token', validate(reviewTokenParamSchema), ctrl.getReviewByToken);
router.post(
  '/reviews/token/:token/products/:productId',
  validate(tokenReviewSchema),
  ctrl.submitTokenReview,
);
router.post(
  '/reviews/token/:token/upload',
  validate(reviewTokenParamSchema),
  requireValidReviewToken,
  uploadTimeoutMiddleware,
  upload.single('image'),
  uploadErrorHandler,
  ctrl.uploadTokenReviewImage,
);

// ===========================================================================
// AUTHENTICATED
// ===========================================================================

router.post(
  '/reviews/products/:productId/reviews',
  authenticate,
  validate(submitReviewSchema),
  ctrl.submitReview,
);
router.delete(
  '/reviews/reviews/:reviewId',
  authenticate,
  validate(reviewIdSchema),
  ctrl.deleteReview,
);
router.post(
  '/reviews/reviews/:reviewId/vote',
  authenticate,
  validate(reviewIdSchema),
  ctrl.voteHelpful,
);
router.post(
  '/reviews/reviews/:reviewId/report',
  authenticate,
  validate(reportSchema),
  ctrl.reportReview,
);
router.post(
  '/reviews/products/:productId/questions',
  authenticate,
  validate(submitQuestionSchema),
  ctrl.submitQuestion,
);
router.post(
  '/reviews/questions/:questionId/answers',
  authenticate,
  validate(submitAnswerSchema),
  ctrl.submitAnswer,
);
router.post(
  '/reviews/questions/:questionId/vote',
  authenticate,
  validate(questionIdSchema),
  ctrl.voteQuestion,
);
router.get('/reviews/my-reviews', authenticate, ctrl.getMyReviews);

// ===========================================================================
// ADMIN
// ===========================================================================

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

adminRouter.post(
  '/reviews/products/:productId/reviews',
  validate(adminCreateReviewSchema),
  ctrl.adminCreateReview,
);
adminRouter.delete('/reviews/reviews/:reviewId', validate(reviewIdSchema), ctrl.adminDeleteReview);
adminRouter.get('/reviews/moderation', ctrl.adminGetModeration);
adminRouter.patch('/reviews/reviews/:id/approve', ctrl.adminApproveReview);
adminRouter.patch('/reviews/reviews/:id/reject', validate(rejectSchema), ctrl.adminRejectReview);
adminRouter.post('/reviews/reviews/:id/reply', validate(adminReplySchema), ctrl.adminReplyToReview);
adminRouter.patch('/reviews/reviews/:id/pin', ctrl.adminPinReview);
adminRouter.patch('/reviews/questions/:id/approve', ctrl.adminApproveQuestion);
adminRouter.patch('/reviews/questions/:id/reject', ctrl.adminRejectQuestion);
adminRouter.get('/reviews/analytics', ctrl.adminGetAnalytics);
adminRouter.get('/reviews/reported', ctrl.adminGetReported);
adminRouter.patch('/reviews/products/:productId/rating-summary', ctrl.adminUpdateRatingOneLiner);

router.use('/admin', adminRouter);

export default router;
