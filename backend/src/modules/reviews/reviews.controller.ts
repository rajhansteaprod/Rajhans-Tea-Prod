import { Request, Response } from 'express';
import { ReviewService } from './services/review.service';
import { QAService } from './services/qa.service';
import { sendSuccess, sendCreated, sendPaginated, sendNoContent } from '../../utils/api-response';

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

export const getProductQA = async (req: Request, res: Response) => {
  const productId = req.params['productId'] as string;
  const { page, limit } = req.query as Record<string, string | undefined>;
  const result = await qaService.getProductQA(productId, {
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
  });
  sendPaginated(res, result.questions, result.meta, 'Q&A');
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

export const adminGetModeration = async (req: Request, res: Response) => {
  const { page, limit, type } = req.query as Record<string, string | undefined>;
  if (type === 'questions') {
    const result = await qaService.getModerationQueue({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    sendPaginated(res, result.questions, result.meta, 'Questions moderation');
  } else {
    const result = await reviewService.getModerationQueue({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
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
