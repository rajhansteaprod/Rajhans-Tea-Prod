import { Request, Response } from 'express';
import { SessionService } from '../../../services/session.service';
import { sendSuccess, sendNoContent } from '../../../utils/api-response';

const sessionService = new SessionService();

/**
 * GET /auth/sessions
 *
 * Returns all active sessions (refresh tokens) for the currently authenticated user.
 * The session the caller is making this request from is marked as isCurrent: true.
 *
 * How isCurrent works:
 * The refresh token lives in an httpOnly cookie set by the backend at login.
 * We read it here server-side and hash it to find the matching token record.
 * The frontend never needs to know the raw refresh token for this feature.
 */
export const listSessions = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const rawRefreshToken = req.cookies?.refreshToken ?? null;

  const sessions = await sessionService.getUserSessions(userId, rawRefreshToken);
  sendSuccess(res, sessions, `${sessions.length} active session(s)`);
};

/**
 * DELETE /auth/sessions/:sessionId
 *
 * Revoke a specific session owned by the calling user.
 * Returns 403 if they try to delete someone else's session.
 */
export const revokeSession = async (req: Request, res: Response) => {
  const sessionId = req.params['sessionId'] as string;
  const userId = req.user!.userId;

  await sessionService.revokeOwnSession(sessionId, userId);
  sendNoContent(res);
};
