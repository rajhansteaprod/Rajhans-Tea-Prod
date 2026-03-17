import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../utils/api-error';
import { UserRepository } from '../repositories/user.repository';
import { TokenRepository } from '../repositories/token.repository';
import { ITokenPayload } from '../types/auth.types';
import { getFirebaseAuth } from '../loaders';
import { AuthDTO } from '../dto';

export class AuthService {
  private userRepo: UserRepository;
  private tokenRepo: TokenRepository;

  constructor() {
    this.userRepo = new UserRepository();
    this.tokenRepo = new TokenRepository();
  }

  async verifyFirebaseToken(idToken: string) {
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
      if (!user.isPhoneVerified) {
        await this.userRepo.updateById(user._id.toString(), { isPhoneVerified: true });
      }
      await this.userRepo.updateLastLogin(user._id.toString());
    }

    // Generate our JWT tokens
    const tokens = await this.generateTokens({ userId: user._id.toString(), role: user.role });

    // AuthDTO.fromLogin shapes the response: minimal user embed + tokens + isNewUser flag
    return AuthDTO.fromLogin(user, tokens, isNewUser);
  }

  async refreshToken(refreshToken: string) {
    const tokenRecord = await this.tokenRepo.findByToken(this.hashToken(refreshToken));

    if (!tokenRecord) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const user = await this.userRepo.findById(tokenRecord.user.toString());
    if (!user || !user.isActive) {
      throw new UnauthorizedError('User not found or inactive');
    }

    // Rotate: delete old token, issue new pair
    await this.tokenRepo.deleteByToken(tokenRecord.token);

    const tokens = await this.generateTokens({ userId: user._id.toString(), role: user.role });

    return AuthDTO.fromRefresh(tokens);
  }

  /**
   * Fetches the full user document and shapes it based on the caller's role.
   * Used by the GET /auth/me endpoint.
   *
   * Why fetch from DB here instead of just returning req.user (JWT payload)?
   * The JWT payload only contains { userId, role } — that's intentionally minimal
   * for token size. The profile endpoint should return the actual stored profile
   * (name, email, avatar, etc.) which lives in the DB, not the token.
   */
  async getProfile(userId: string, role: 'admin' | 'customer') {
    const user = await this.userRepo.findById(userId);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return AuthDTO.fromProfile(user, role);
  }

  async logout(refreshToken: string) {
    await this.tokenRepo.deleteByToken(this.hashToken(refreshToken));
  }

  async logoutAll(userId: string) {
    await this.tokenRepo.deleteByUserId(userId);
  }

  private async generateTokens(payload: ITokenPayload) {
    const signOptions: SignOptions = {
      expiresIn: config.jwt.accessExpiry as SignOptions['expiresIn'],
    };
    const accessToken = jwt.sign(
      { userId: payload.userId, role: payload.role },
      config.jwt.accessSecret,
      signOptions,
    );

    const refreshToken = crypto.randomBytes(40).toString('hex');

    // Store hashed refresh token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await this.tokenRepo.create({
      user: payload.userId,
      token: this.hashToken(refreshToken),
      type: 'refresh',
      expiresAt,
    } as never);

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
