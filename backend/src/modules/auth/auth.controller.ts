import { Request, Response } from 'express';
import { AuthService } from './services/auth.service';
import { sendSuccess, sendCreated } from '../../utils/api-response';
import { extractDeviceInfo } from '../../utils/device-parser';
import { BadRequestError } from '../../utils/api-error';

const authService = new AuthService();

export const verifyFirebaseToken = async (req: Request, res: Response) => {
  const { idToken } = req.body;

  // Capture device info (browser, OS, IP) to store with the refresh token.
  // This is what powers the "active sessions" feature.
  const deviceInfo = extractDeviceInfo(req);

  const result = await authService.verifyFirebaseToken(idToken, deviceInfo);

  // Set refresh token as httpOnly cookie — JS cannot read it (XSS protection)
  res.cookie('refreshToken', result.tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  // Strip refreshToken from response body — it's already in the httpOnly cookie
  const { refreshToken: _rt, ...safeTokens } = result.tokens;
  sendCreated(res, { ...result, tokens: { accessToken: safeTokens.accessToken } }, result.isNewUser ? 'Account created successfully' : 'Login successful');
};

export const refreshToken = async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken || req.body.refreshToken;
  if (!token) throw new BadRequestError('Refresh token is required');

  // Update device info on each refresh so sessions reflect the most recent browser/IP
  const deviceInfo = extractDeviceInfo(req);

  const result = await authService.refreshToken(token, deviceInfo);

  res.cookie('refreshToken', result.tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  // Strip refreshToken from response body — it's already in the httpOnly cookie
  sendSuccess(res, { tokens: { accessToken: result.tokens.accessToken } }, 'Token refreshed successfully');
};

export const logout = async (req: Request, res: Response) => {
  const token = req.body.refreshToken || req.cookies?.refreshToken;
  if (token) {
    await authService.logout(token);
  }

  res.clearCookie('refreshToken');
  sendSuccess(res, null, 'Logged out successfully');
};

export const logoutAll = async (req: Request, res: Response) => {
  await authService.logoutAll(req.user!.userId);
  res.clearCookie('refreshToken');
  sendSuccess(res, null, 'Logged out from all devices');
};

export const me = async (req: Request, res: Response) => {
  // req.user only has { userId, role } from the JWT.
  // getProfile fetches the full document from DB, then shapes it via UserDTO.fromRole:
  //   - admin calling /me → UserAdminView (all fields including isActive, lastLogin, etc.)
  //   - customer calling /me → UserPublicView (safe public fields only)
  const result = await authService.getProfile(
    req.user!.userId,
    req.user!.role as 'admin' | 'customer',
  );
  sendSuccess(res, result, 'User profile');
};
