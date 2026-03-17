import { Request, Response } from 'express';
import { AuthService } from '../../../services/auth.service';
import { sendSuccess, sendCreated } from '../../../utils/api-response';
import { extractDeviceInfo } from '../../../utils/device-parser';

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
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
  });

  sendCreated(res, result, result.isNewUser ? 'Account created successfully' : 'Login successful');
};

export const refreshToken = async (req: Request, res: Response) => {
  const token = req.body.refreshToken || req.cookies?.refreshToken;

  // Update device info on each refresh so sessions reflect the most recent browser/IP
  const deviceInfo = extractDeviceInfo(req);

  const result = await authService.refreshToken(token, deviceInfo);

  res.cookie('refreshToken', result.tokens.refreshToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   7 * 24 * 60 * 60 * 1000,
  });

  sendSuccess(res, result, 'Token refreshed successfully');
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
