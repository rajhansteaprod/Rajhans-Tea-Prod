import { Request, Response } from 'express';
import { ReviewService } from './services/review.service';
import { QAService } from './services/qa.service';
import { sendSuccess, sendCreated, sendPaginated, sendNoContent } from '../../utils/api-response';
import { BadRequestError } from '../../utils/api-error';

const reviewService = new ReviewService();
const qaService = new QAService();

// ─── Public ──────────────────────────────────────────────────────────────────

export const getProductReviews = async (req: Request, res: Response) => {
  const productId = req.params['productId'] as string;
  const { page, limit, sort, rating } = req.query as Record<string, string | undefined>;
  const result = await reviewService.getProductReviews(productId, {
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
    sort,
    rating: rating ? parseInt(rating, 10) : undefined,
  });
  sendPaginated(res, result.reviews, result.meta, 'Reviews');
};

export const getRatingSummary = async (req: Request, res: Response) => {
  const summary = await reviewService.getRatingSummary(req.params['productId'] as string);
  sendSuccess(res, summary);
};

export const getRatingSummaries = async (req: Request, res: Response) => {
  const idsParam = (req.query['productIds'] as string | undefined) ?? '';
  const productIds = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100);
  const summaries = await reviewService.getSummariesForProducts(productIds);
  sendSuccess(res, summaries, 'Rating summaries');
};

export const getProductQA = async (req: Request, res: Response) => {
  const productId = req.params['productId'] as string;
  const { page, limit } = req.query as Record<string, string | undefined>;
  const result = await qaService.getProductQA(productId, {
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
  });
  sendPaginated(res, result.questions, result.meta, 'Q&A');
};

// ─── Anonymous order-token reviews (no auth) ─────────────────────────────────

export const getReviewByToken = async (req: Request, res: Response) => {
  const info = await reviewService.getTokenInfo(req.params['token'] as string);
  sendSuccess(res, info);
};

export const submitTokenReview = async (req: Request, res: Response) => {
  const token = req.params['token'] as string;
  const productId = req.params['productId'] as string;
  const review = await reviewService.submitTokenReview(token, productId, req.body);
  sendCreated(res, review, 'Review submitted');
};

export const uploadTokenReviewImage = async (req: Request, res: Response) => {
  if (!req.file || !req.file.filename) {
    throw new BadRequestError('No file uploaded');
  }
  const url = `/uploads/${req.file.filename}`;
  sendSuccess(res, { url }, 'Image uploaded successfully');
};

// ─── Authenticated ───────────────────────────────────────────────────────────

export const submitReview = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const productId = req.params['productId'] as string;
  const review = await reviewService.submitReview(userId, productId, req.body);
  sendCreated(res, review, 'Review submitted');
};

export const deleteReview = async (req: Request, res: Response) => {
  await reviewService.deleteReview(req.user!.userId, req.params['reviewId'] as string);
  sendNoContent(res);
};

export const voteHelpful = async (req: Request, res: Response) => {
  const action = await reviewService.voteHelpful(
    req.user!.userId,
    req.params['reviewId'] as string,
  );
  sendSuccess(res, { action }, action === 'added' ? 'Vote added' : 'Vote removed');
};

export const reportReview = async (req: Request, res: Response) => {
  const { reason, details } = req.body;
  await reviewService.reportReview(
    req.user!.userId,
    req.params['reviewId'] as string,
    reason,
    details,
  );
  sendSuccess(res, { reported: true }, 'Review reported');
};

export const submitQuestion = async (req: Request, res: Response) => {
  const question = await qaService.submitQuestion(
    req.user!.userId,
    req.params['productId'] as string,
    req.body.questionText,
  );
  sendCreated(res, question, 'Question submitted');
};

export const submitAnswer = async (req: Request, res: Response) => {
  await qaService.submitAnswer(req.user!.userId, req.params['questionId'] as string, req.body.body);
  sendSuccess(res, { answered: true }, 'Answer submitted');
};

export const voteQuestion = async (req: Request, res: Response) => {
  await qaService.voteQuestion(req.params['questionId'] as string);
  sendSuccess(res, { voted: true }, 'Vote recorded');
};

export const getMyReviews = async (req: Request, res: Response) => {
  const { page, limit } = req.query as Record<string, string | undefined>;
  const result = await reviewService.getMyReviews(req.user!.userId, {
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
  });
  sendPaginated(res, result.reviews, result.meta, 'My reviews');
};

// ─── Admin ───────────────────────────────────────────────────────────────────

export const adminCreateReview = async (req: Request, res: Response) => {
  const productId = req.params['productId'] as string;
  const { reviewerName, rating, reviewText, images } = req.body;
  const review = await reviewService.adminCreateReview(productId, {
    reviewerName,
    rating,
    reviewText,
    images,
  });
  sendCreated(res, review, 'Review created');
};

export const adminDeleteReview = async (req: Request, res: Response) => {
  await reviewService.adminDeleteReview(req.params['reviewId'] as string);
  sendNoContent(res);
};

const MODERATION_STATUSES = ['pending', 'approved', 'rejected', 'all'] as const;
type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export const adminGetModeration = async (req: Request, res: Response) => {
  const { page, limit, type, status } = req.query as Record<string, string | undefined>;
  if (type === 'questions') {
    const result = await qaService.getModerationQueue({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    sendPaginated(res, result.questions, result.meta, 'Questions moderation');
  } else {
    if (status && !MODERATION_STATUSES.includes(status as ModerationStatus)) {
      throw new BadRequestError(`status must be one of: ${MODERATION_STATUSES.join(', ')}`);
    }
    const result = await reviewService.getModerationQueue({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      status: status as ModerationStatus | undefined,
    });
    sendPaginated(res, result.reviews, result.meta, 'Reviews moderation');
  }
};

export const adminApproveReview = async (req: Request, res: Response) => {
  await reviewService.approveReview(req.params['id'] as string);
  sendSuccess(res, { approved: true }, 'Review approved');
};

export const adminRejectReview = async (req: Request, res: Response) => {
  await reviewService.rejectReview(req.params['id'] as string, req.body.reason);
  sendSuccess(res, { rejected: true }, 'Review rejected');
};

export const adminReplyToReview = async (req: Request, res: Response) => {
  await reviewService.replyToReview(req.params['id'] as string, req.user!.userId, req.body.body);
  sendSuccess(res, { replied: true }, 'Reply added');
};

export const adminPinReview = async (req: Request, res: Response) => {
  await reviewService.pinReview(req.params['id'] as string);
  sendSuccess(res, { toggled: true }, 'Pin toggled');
};

export const adminApproveQuestion = async (req: Request, res: Response) => {
  await qaService.approveQuestion(req.params['id'] as string);
  sendSuccess(res, { approved: true }, 'Question approved');
};

export const adminRejectQuestion = async (req: Request, res: Response) => {
  await qaService.rejectQuestion(req.params['id'] as string);
  sendSuccess(res, { rejected: true }, 'Question rejected');
};

export const adminGetAnalytics = async (_req: Request, res: Response) => {
  const analytics = await reviewService.getAnalytics();
  sendSuccess(res, analytics);
};

export const adminGetReported = async (req: Request, res: Response) => {
  const { page, limit } = req.query as Record<string, string | undefined>;
  const result = await reviewService.getMostReported({
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
  });
  sendPaginated(res, result.reviews, result.meta, 'Reported reviews');
};

export const adminUpdateRatingOneLiner = async (req: Request, res: Response) => {
  const productId = req.params['productId'] as string;
  const { ratingOneLiner } = req.body;
  await reviewService.updateRatingOneLiner(productId, ratingOneLiner || '');
  sendSuccess(res, { updated: true }, 'Rating summary updated');
};
