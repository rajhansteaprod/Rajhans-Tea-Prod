import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';
import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from '../utils/api-error';
import { UserRepository } from '../repositories/user.repository';
import { TokenRepository } from '../repositories/token.repository';
import { ITokenPayload } from '../types/auth.types';
import { getFirebaseAuth } from '../loaders';
import { IDeviceInfo } from '../models/token.model';
import { AuthDTO } from '../dto';

export class AuthService {
  private userRepo: UserRepository;
  private tokenRepo: TokenRepository;

  constructor(
    userRepo: UserRepository = new UserRepository(),
    tokenRepo: TokenRepository = new TokenRepository(),
  ) {
    this.userRepo  = userRepo;
    this.tokenRepo = tokenRepo;
  }

  /**
   * Exchange a Firebase ID token for our JWT access + refresh token pair.
   * Creates a new user if this phone number hasn't been seen before.
   *
   * @param idToken    - The Firebase ID token from the frontend after OTP verification.
   * @param deviceInfo - Device/browser info extracted from the HTTP request.
   */
  async verifyFirebaseToken(idToken: string, deviceInfo: IDeviceInfo) {
    const firebaseAuth = getFirebaseAuth();

    let decodedToken;
    try {
      decodedToken = await firebaseAuth.verifyIdToken(idToken);
    } catch {
      throw new UnauthorizedError('Invalid or expired Firebase token');
    }

    const phone = decodedToken.phone_number;
    if (!phone) {
      throw new BadRequestError('Phone number not found in Firebase token');
    }

    // Strip country code (+91) to get 10-digit number
    const phoneNumber = phone.replace(/^\+91/, '');

    // Find or create user
    let user = await this.userRepo.findByPhone(phoneNumber);
    let isNewUser = false;

    if (!user) {
      user = await this.userRepo.create({
        phone: phoneNumber,
        isPhoneVerified: true,
      } as never);
      isNewUser = true;
    } else {
      if (user.isBanned) {
        throw new ForbiddenError('Your account has been suspended. Contact support for assistance.');
      }
      if (!user.isPhoneVerified) {
        await this.userRepo.updateById(user._id.toString(), { isPhoneVerified: true });
      }
      await this.userRepo.updateLastLogin(user._id.toString());
    }

    // Generate JWT pair, storing deviceInfo with the refresh token
    const tokens = await this.generateTokens(
      { userId: user._id.toString(), role: user.role },
      deviceInfo,
    );

    // AuthDTO.fromLogin shapes the response: minimal user embed + tokens + isNewUser flag
    return AuthDTO.fromLogin(user, tokens, isNewUser);
  }

  /**
   * Rotate the refresh token: validate the old one, delete it, issue a fresh pair.
   * Updates lastUsedAt on the outgoing token before deleting so the session list
   * reflects the most recent activity.
   *
   * @param rawRefreshToken - The plain-text refresh token (not hashed).
   * @param deviceInfo      - Updated device info at the time of refresh.
   */
  async refreshToken(rawRefreshToken: string, deviceInfo: IDeviceInfo) {
    const tokenRecord = await this.tokenRepo.findByToken(this.hashToken(rawRefreshToken));

    if (!tokenRecord) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const user = await this.userRepo.findById(tokenRecord.user.toString());
    if (!user || !user.isActive) {
      throw new UnauthorizedError('User not found or inactive');
    }
    if (user.isBanned) {
      throw new ForbiddenError('Your account has been suspended. Contact support for assistance.');
    }

    // Stamp lastUsedAt before we delete the old record so the time is preserved
    // in the new token's creation timestamp (close enough for "last active" display)
    await this.tokenRepo.deleteByToken(tokenRecord.token);

    const tokens = await this.generateTokens(
      { userId: user._id.toString(), role: user.role },
      deviceInfo,
    );

    return AuthDTO.fromRefresh(tokens);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    await this.tokenRepo.deleteByToken(this.hashToken(rawRefreshToken));
  }

  async logoutAll(userId: string): Promise<void> {
    await this.tokenRepo.deleteByUserId(userId);
  }

  /**
   * Fetch the full user document and shape it based on the caller's role.
   * Used by GET /auth/me.
   *
   * Admin → UserAdminView (all fields)
   * Customer → UserPublicView (safe public fields only)
   */
  async getProfile(userId: string, role: 'admin' | 'customer') {
    const user = await this.userRepo.findById(userId);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return AuthDTO.fromProfile(user, role);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Sign a JWT access token + generate a random refresh token,
   * store the hashed refresh token in the database with device info.
   */
  private async generateTokens(payload: ITokenPayload, deviceInfo: IDeviceInfo) {
    const signOptions: SignOptions = {
      expiresIn: config.jwt.accessExpiry as SignOptions['expiresIn'],
    };

    const accessToken = jwt.sign(
      { userId: payload.userId, role: payload.role },
      config.jwt.accessSecret,
      signOptions,
    );

    const refreshToken = crypto.randomBytes(40).toString('hex');

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await this.tokenRepo.create({
      user:       payload.userId,
      token:      this.hashToken(refreshToken),
      type:       'refresh',
      expiresAt,
      deviceInfo,
      lastUsedAt: new Date(),
    } as never);

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
