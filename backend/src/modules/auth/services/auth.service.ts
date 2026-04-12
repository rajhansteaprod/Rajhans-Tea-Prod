import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../../../config';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../../utils/api-error';
import { UserRepository } from '../repositories/user.repository';
import { TokenRepository } from '../repositories/token.repository';
import { ITokenPayload } from '../../../types/auth.types';
import { getFirebaseAuth } from '../../../loaders';
import { IDeviceInfo } from '../models/token.model';
import { AuthDTO } from '../dto/auth.dto';

export class AuthService {
  private userRepo: UserRepository;
  private tokenRepo: TokenRepository;

  constructor(
    userRepo: UserRepository = new UserRepository(),
    tokenRepo: TokenRepository = new TokenRepository(),
  ) {
    this.userRepo = userRepo;
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
    console.log('🔐 [Backend] verifyFirebaseToken called');
    console.log('🔑 [Backend] Received token length:', idToken.length);
    console.log('🔑 [Backend] Token preview:', idToken.substring(0, 50) + '...');

    const firebaseAuth = getFirebaseAuth();

    if (!firebaseAuth) {
      console.error('❌ [Backend] Firebase Auth not initialized!');
      throw new UnauthorizedError('Firebase not initialized');
    }

    let decodedToken;
    try {
      console.log('🔐 [Backend] Calling firebaseAuth.verifyIdToken()...');
      decodedToken = await firebaseAuth.verifyIdToken(idToken);
      console.log('✅ [Backend] Token verified successfully');
      console.log('👤 [Backend] User ID:', decodedToken.uid);
      console.log('📱 [Backend] Phone:', decodedToken.phone_number);
    } catch (error: any) {
      // Log the actual Firebase error for debugging
      console.error('❌ [Backend] Firebase token verification FAILED');
      console.error('❌ [Backend] Error details:', {
        code: error?.code,
        message: error?.message,
        name: error?.name,
        errorInfo: error?.errorInfo,
        fullError: error?.toString(),
      });
      throw new UnauthorizedError(`Firebase verification failed: ${error?.message || 'Unknown error'}`);
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
        throw new ForbiddenError(
          'Your account has been suspended. Contact support for assistance.',
        );
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
  // Profile & Address management
  // ---------------------------------------------------------------------------

  /**
   * Update basic profile fields (firstName, lastName, email).
   */
  async updateProfile(
    userId: string,
    data: { firstName?: string; lastName?: string; email?: string },
  ) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundError('User not found');

    const updated = await this.userRepo.updateById(userId, data);
    return updated;
  }

  /**
   * Return the addresses array for a given user.
   */
  async getAddresses(userId: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundError('User not found');
    return user.addresses;
  }

  /**
   * Push a new address onto the user's addresses array.
   * If it's marked as default (or is the first address), ensure only one default.
   */
  async addAddress(
    userId: string,
    address: {
      label: string;
      street: string;
      city: string;
      state: string;
      postalCode: string;
      country?: string;
      isDefault?: boolean;
    },
  ) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundError('User not found');

    // First address is always default
    if (user.addresses.length === 0) {
      address.isDefault = true;
    }

    // If new address is default, unset existing defaults
    if (address.isDefault) {
      user.addresses.forEach((a) => (a.isDefault = false));
    }

    user.addresses.push(address as never);
    await user.save();
    return user.addresses;
  }

  /**
   * Update a specific address inside the user's addresses array.
   */
  async updateAddress(
    userId: string,
    addressId: string,
    data: Partial<{
      label: string;
      street: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
      isDefault: boolean;
    }>,
  ) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundError('User not found');

    const address = user.addresses.id(addressId);
    if (!address) throw new NotFoundError('Address not found');

    // If setting this address as default, unset others
    if (data.isDefault) {
      user.addresses.forEach((a) => (a.isDefault = false));
    }

    Object.assign(address, data);
    await user.save();
    return user.addresses;
  }

  /**
   * Remove an address from the array.
   */
  async deleteAddress(userId: string, addressId: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundError('User not found');

    const address = user.addresses.id(addressId);
    if (!address) throw new NotFoundError('Address not found');

    const wasDefault = address.isDefault;
    address.deleteOne();

    // If the deleted address was the default and others remain, promote the first
    if (wasDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }

    await user.save();
    return user.addresses;
  }

  /**
   * Set a specific address as the default; unsets all others.
   */
  async setDefaultAddress(userId: string, addressId: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundError('User not found');

    const address = user.addresses.id(addressId);
    if (!address) throw new NotFoundError('Address not found');

    user.addresses.forEach((a) => (a.isDefault = false));
    address.isDefault = true;
    await user.save();
    return user.addresses;
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
      user: payload.userId,
      token: this.hashToken(refreshToken),
      type: 'refresh',
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
