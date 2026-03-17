import crypto from 'crypto';
import { TokenRepository } from '../repositories/token.repository';
import { ForbiddenError, NotFoundError } from '../utils/api-error';
import { SessionDTO, SessionUserView, SessionAdminView } from '../dto/session.dto';

export class SessionService {
  private tokenRepo: TokenRepository;

  constructor() {
    this.tokenRepo = new TokenRepository();
  }

  // ---------------------------------------------------------------------------
  // User-facing — operates only on the caller's own sessions
  // ---------------------------------------------------------------------------

  /**
   * List all active sessions for the calling user.
   *
   * The raw refresh token (from the httpOnly cookie) is passed so we can
   * compute its hash and mark the current session as isCurrent: true.
   * If the cookie isn't present (e.g. logout race), isCurrent = false for all.
   */
  async getUserSessions(userId: string, rawRefreshToken: string | null): Promise<SessionUserView[]> {
    const tokens = await this.tokenRepo.findByUserId(userId);
    const currentHash = rawRefreshToken ? this.hashToken(rawRefreshToken) : null;
    return tokens.map((t) => SessionDTO.forUser(t, currentHash));
  }

  /**
   * Revoke a single session belonging to the calling user.
   * Throws 404 if not found, 403 if the session belongs to someone else.
   */
  async revokeOwnSession(sessionId: string, userId: string): Promise<void> {
    const token = await this.tokenRepo.findById(sessionId);

    if (!token) {
      throw new NotFoundError('Session not found');
    }
    if (token.user.toString() !== userId) {
      // Don't reveal the session exists for another user
      throw new ForbiddenError('You can only revoke your own sessions');
    }

    await this.tokenRepo.deleteById(sessionId);
  }

  // ---------------------------------------------------------------------------
  // Admin-facing — operates on any user's sessions
  // ---------------------------------------------------------------------------

  /**
   * List all active sessions for any user (admin only).
   * Returns the admin view which includes full IP + raw UA string.
   */
  async getAdminUserSessions(userId: string): Promise<SessionAdminView[]> {
    const tokens = await this.tokenRepo.findByUserId(userId);
    return tokens.map((t) => SessionDTO.forAdmin(t));
  }

  /**
   * Revoke any specific session by ID (admin only).
   * Returns the userId so the caller can log the action.
   */
  async adminRevokeSession(sessionId: string): Promise<{ userId: string; deviceName: string }> {
    const token = await this.tokenRepo.findById(sessionId);

    if (!token) {
      throw new NotFoundError('Session not found');
    }

    const userId     = token.user.toString();
    const deviceName = token.deviceInfo?.deviceName ?? 'Unknown Device';

    await this.tokenRepo.deleteById(sessionId);

    return { userId, deviceName };
  }

  /**
   * Force-logout all sessions for a user (admin only).
   * Useful when banning a user or responding to a suspected compromise.
   */
  async adminRevokeAllSessions(userId: string): Promise<void> {
    await this.tokenRepo.deleteByUserId(userId);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
