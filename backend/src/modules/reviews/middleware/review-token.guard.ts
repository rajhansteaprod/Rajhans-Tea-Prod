import { Request, Response, NextFunction } from 'express';
import { reviewTokenService } from '../services/review-token.service';
import { NotFoundError } from '../../../utils/api-error';

/**
 * Gate an unauthenticated route on a still-valid review token. Runs before
 * multer so we never accept an uploaded file for an expired/invalid token.
 */
export const requireValidReviewToken = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const token = req.params['token'] as string;
    const payload = await reviewTokenService.getPayload(token);
    if (!payload) throw new NotFoundError('This review link is invalid or has expired');
    next();
  } catch (err) {
    next(err);
  }
};
