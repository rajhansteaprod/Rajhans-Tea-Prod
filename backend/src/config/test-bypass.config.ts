/**
 * ⚠️ DEV ONLY - Test OTP Bypass Configuration
 *
 * This file allows hardcoded OTP for testing purposes.
 * REMOVE THIS FILE BEFORE PRODUCTION DEPLOYMENT.
 *
 * To disable:
 * 1. Set OTP_BYPASS_ENABLED=false in .env
 * 2. Delete this file
 * 3. Remove all blocks marked with ⚠️ DEV BYPASS from otp.service.ts
 */

export const TEST_BYPASS_CONFIG = {
  // ⚠️ DEV ONLY - Remove before production
  ENABLED: process.env.OTP_BYPASS_ENABLED === 'true',

  TEST_NUMBERS: {
    '6266303713': '123456',
    '7879119076': '123456',
  },

  BYPASS_MESSAGE: 'OTP (TEST MODE - Dev Only): ',
};

/**
 * Check if phone number is a test number
 */
export function isTestPhoneNumber(phone: string): boolean {
  if (!TEST_BYPASS_CONFIG.ENABLED) return false;

  const normalized = phone.toString().trim();
  return Object.keys(TEST_BYPASS_CONFIG.TEST_NUMBERS).includes(normalized);
}

/**
 * Get hardcoded OTP for test phone number
 */
export function getTestOtp(phone: string): string | null {
  if (!TEST_BYPASS_CONFIG.ENABLED) return null;

  const normalized = phone.toString().trim();
  return TEST_BYPASS_CONFIG.TEST_NUMBERS[normalized as keyof typeof TEST_BYPASS_CONFIG.TEST_NUMBERS] || null;
}
