import axios from 'axios';
import { config } from '../../config';
import { BadRequestError, UnauthorizedError } from '../../utils/api-error';
import { logger } from '../../utils/logger';
import { isTestPhoneNumber, getTestOtp } from '../../config/test-bypass.config';

const MSG91_OTP_URL = 'https://control.msg91.com/api/v5/otp';

export class OtpService {
  /**
   * Send OTP to a phone number via MSG91 OTP service
   * MSG91 generates and manages the OTP
   */
  async sendOtp(phone: string): Promise<{ success: boolean; message: string }> {
    if (!phone || phone.length !== 10) {
      throw new BadRequestError('Phone number must be 10 digits');
    }

    // ⚠️ DEV BYPASS - Remove this entire block before production
    if (isTestPhoneNumber(phone)) {
      const testOtp = getTestOtp(phone);
      logger.warn(
        { phone, otp: testOtp },
        '🚨 DEV MODE: Using hardcoded OTP (remove before production)',
      );
      return {
        success: true,
        message: `OTP sent (TEST MODE) - Use: ${testOtp}`,
      };
    }
    // ⚠️ END DEV BYPASS

    const authKey = config.communication.sms.msg91.authKey;
    const senderId = config.communication.sms.msg91.senderId;

    logger.info(
      { authKeyPresent: !!authKey, phone, senderId },
      'OTP Send: Starting - Auth key present',
    );

    if (!authKey) {
      logger.error('MSG91_AUTH_KEY not configured');
      throw new Error('MSG91_AUTH_KEY not configured');
    }

    try {
      const url = `${MSG91_OTP_URL}?authkey=${authKey}&mobile=91${phone}`;
      const requestBody = {
        Param1: senderId,
        Param2: phone,
      };

      logger.info(
        {
          url: url.replace(authKey, '***AUTH_KEY***'),
          phone,
          body: requestBody,
        },
        'OTP Send: Making request to MSG91',
      );

      const response = await axios.post(url, requestBody, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      });

      logger.info(
        {
          phone,
          statusCode: response.status,
          statusText: response.statusText,
          responseData: response.data,
          headers: response.headers,
        },
        'OTP Send: MSG91 Response Success',
      );

      return {
        success: true,
        message: 'OTP sent successfully',
      };
    } catch (error: any) {
      logger.error(
        {
          phone,
          authKeyPrefix: config.communication.sms.msg91.authKey.substring(0, 5),
          requestUrl: `${MSG91_OTP_URL}?authkey=***&mobile=91${phone}`,
          errorStatusCode: error.response?.status,
          errorStatusText: error.response?.statusText,
          errorResponseData: error.response?.data,
          errorMessage: error.message,
          errorCode: error.code,
        },
        'OTP Send: MSG91 API Failed',
      );
      throw new Error(`Failed to send OTP: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Verify OTP via MSG91 OTP service
   * Validates OTP against MSG91's stored OTP
   */
  async verifyOtp(phone: string, otp: string): Promise<boolean> {
    if (!phone || phone.length !== 10) {
      throw new BadRequestError('Phone number must be 10 digits');
    }

    if (!otp || otp.length !== 6) {
      throw new BadRequestError('OTP must be 6 digits');
    }

    // ⚠️ DEV BYPASS - Remove this entire block before production
    if (isTestPhoneNumber(phone)) {
      const expectedOtp = getTestOtp(phone);
      if (otp === expectedOtp) {
        logger.warn(
          { phone, otp },
          '🚨 DEV MODE: OTP verified using hardcoded test value (remove before production)',
        );
        return true;
      }
      throw new UnauthorizedError('Invalid OTP');
    }
    // ⚠️ END DEV BYPASS

    const authKey = config.communication.sms.msg91.authKey;
    if (!authKey) {
      logger.error('MSG91_AUTH_KEY not configured');
      throw new Error('MSG91_AUTH_KEY not configured');
    }

    try {
      logger.info({ phone, otpLength: otp.length }, 'OTP Verify: Calling MSG91 API');

      const response = await axios.get(
        `${MSG91_OTP_URL}/verify?otp=${otp}&mobile=91${phone}&authkey=${authKey}`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        },
      );

      logger.info({ status: response.status, phone }, 'OTP Verify: MSG91 API Success');
      return true;
    } catch (error: any) {
      logger.error(
        {
          phone,
          errorStatus: error.response?.status,
          errorData: error.response?.data,
          errorMessage: error.message,
        },
        'OTP Verify: MSG91 API Failed',
      );
      throw new UnauthorizedError('Invalid or expired OTP');
    }
  }

  /**
   * Resend OTP via MSG91 retry endpoint
   */
  async resendOtp(phone: string): Promise<{ success: boolean; message: string }> {
    if (!phone || phone.length !== 10) {
      throw new BadRequestError('Phone number must be 10 digits');
    }

    const authKey = config.communication.sms.msg91.authKey;
    if (!authKey) {
      logger.error('MSG91_AUTH_KEY not configured');
      throw new Error('MSG91_AUTH_KEY not configured');
    }

    try {
      logger.info({ phone }, 'OTP Resend: Calling MSG91 API');

      const response = await axios.get(
        `${MSG91_OTP_URL}/retry?authkey=${authKey}&retrytype=text&mobile=91${phone}`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        },
      );

      logger.info({ status: response.status, phone }, 'OTP Resend: MSG91 API Success');

      return {
        success: true,
        message: 'OTP resent successfully',
      };
    } catch (error: any) {
      logger.error(
        {
          phone,
          errorStatus: error.response?.status,
          errorData: error.response?.data,
          errorMessage: error.message,
        },
        'OTP Resend: MSG91 API Failed',
      );
      throw new Error(`Failed to resend OTP: ${error.message}`);
    }
  }
}
