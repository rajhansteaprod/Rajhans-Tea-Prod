import { Request, Response } from 'express';
import { OtpService } from './otp.service';
import { sendSuccess, sendCreated } from '../../utils/api-response';
import { extractDeviceInfo } from '../../utils/device-parser';
import { AuthService } from '../auth/services/auth.service';

const otpService = new OtpService();
const authService = new AuthService();

/**
 * Send OTP to phone number
 * Generates and sends a 6-digit OTP via MSG91
 */
export const sendOtp = async (req: Request, res: Response) => {
  const { phone } = req.body;
  console.log('📱 /otp/send endpoint called for phone:', phone);

  await otpService.sendOtp(phone);
  sendCreated(res, { phone }, 'OTP sent successfully. Valid for 10 minutes.');
};

/**
 * Verify OTP and get JWT tokens
 * Validates OTP and creates/logs in user
 */
export const verifyOtp = async (req: Request, res: Response) => {
  const { phone, otp } = req.body;
  console.log('🔐 /otp/verify endpoint called for phone:', phone);

  const deviceInfo = extractDeviceInfo(req);
  const result = await authService.verifyPhoneAndOtp(phone, otp, deviceInfo);

  // Set refresh token as httpOnly cookie — JS cannot read it (XSS protection)
  res.cookie('refreshToken', result.tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  // Strip refreshToken from response body — it's already in the httpOnly cookie
  const { refreshToken: _rt, ...safeTokens } = result.tokens;
  sendCreated(
    res,
    { ...result, tokens: { accessToken: safeTokens.accessToken } },
    result.isNewUser ? 'Account created successfully' : 'Login successful',
  );
};

/**
 * Resend OTP to phone number
 * Generates a new OTP for the same phone
 */
export const resendOtp = async (req: Request, res: Response) => {
  const { phone } = req.body;
  console.log('📱 /otp/resend endpoint called for phone:', phone);

  await otpService.resendOtp(phone);
  sendSuccess(res, { phone }, 'OTP resent successfully. Valid for 10 minutes.');
};
