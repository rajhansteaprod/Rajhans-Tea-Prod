import { Request, Response } from 'express';
import { SessionService } from '../../../services/session.service';
import { sendSuccess, sendNoContent } from '../../../utils/api-response';

const sessionService = new SessionService();

/**
 * GET /admin/users/:userId/sessions
 *
 * List all active sessions for a specific user.
 * Returns the admin view: full IP + raw user-agent string included.
 */
export const listUserSessions = async (req: Request, res: Response) => {
  const userId = req.params['userId'] as string;
  const sessions = await sessionService.getAdminUserSessions(userId);
  sendSuccess(res, sessions, `${sessions.length} active session(s) for user`);
};

/**
 * DELETE /admin/users/:userId/sessions
 *
 * Force-logout ALL active sessions for a user.
 * Use this when banning a user or responding to a suspected account compromise.
 */
export const revokeAllUserSessions = async (req: Request, res: Response) => {
  const userId = req.params['userId'] as string;
  await sessionService.adminRevokeAllSessions(userId);
  sendNoContent(res);
};

/**
 * DELETE /admin/sessions/:sessionId
 *
 * Force-revoke a specific session by its ID.
 * Admin can revoke any session — not restricted to a specific user.
 * Useful for targeted revocation without disturbing the user's other sessions.
 */
export const adminRevokeSession = async (req: Request, res: Response) => {
  const sessionId = req.params['sessionId'] as string;
  const result = await sessionService.adminRevokeSession(sessionId);
  sendSuccess(res, result, `Session revoked for user ${result.userId}`);
};
