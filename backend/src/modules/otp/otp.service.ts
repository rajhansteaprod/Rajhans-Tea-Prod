import axios from 'axios';
import { config } from '../../config';
import { BadRequestError, TooManyRequestsError, UnauthorizedError } from '../../utils/api-error';
import { logger } from '../../utils/logger';
import { getRedisClient } from '../../loaders';

const MSG91_OTP_URL = 'https://control.msg91.com/api/v5/otp';
const MSG91_WIDGET_VERIFY_URL = 'https://control.msg91.com/api/v5/widget/verifyAccessToken';
const TWO_FACTOR_OTP_URL = 'https://2factor.in/API/V1';
const OTP_REDIS_KEY_PREFIX = 'otp:';
const OTP_LIMIT_REDIS_KEY_PREFIX = 'otp:limit:';

const getOtpRedisKey = (phone: string) => `${OTP_REDIS_KEY_PREFIX}${phone}`;
const getOtpLimitRedisKey = (phone: string) => `${OTP_LIMIT_REDIS_KEY_PREFIX}${phone}`;

/**
 * Reject the request if this phone number has already hit the configured
 * OTP send limit within the current window. Checked before any SMS is sent
 * so we never spend a paid SMS on an over-the-limit request.
 */
const assertOtpRateLimit = async (phone: string): Promise<void> => {
  const max = config.otp.maxPerWindow;
  const key = getOtpLimitRedisKey(phone);
  const current = parseInt((await getRedisClient().get(key)) || '0', 10);

  if (current >= max) {
    logger.warn({ phone, current, max }, 'OTP Send: rate limit exceeded');
    throw new TooManyRequestsError(
      `You can request an OTP only ${max} times per hour. Please try again later.`,
    );
  }
};

/**
 * Record a successful OTP send by incrementing this phone number's counter.
 * On the first send the counter's expiry is set to the configured window, so
 * the count auto-resets when the window passes.
 */
const recordOtpSent = async (phone: string): Promise<void> => {
  const key = getOtpLimitRedisKey(phone);
  const count = await getRedisClient().incr(key);
  if (count === 1) {
    await getRedisClient().pexpire(key, config.otp.windowMs);
  }
};

export class OtpService {
  /**
   * Verify an MSG91 OTP Widget access token server-side.
   * Returns the verified mobile number (with country code) on success.
   */
  async verifyWidgetAccessToken(accessToken: string): Promise<string> {
    if (!accessToken) {
      throw new BadRequestError('Access token is required');
    }

    const authKey = config.communication.sms.msg91.authKey;
    if (!authKey) {
      logger.error('MSG91_AUTH_KEY not configured');
      throw new Error('MSG91_AUTH_KEY not configured');
    }

    try {
      logger.info('Widget Verify: Calling MSG91 verifyAccessToken API');

      const response = await axios.post(MSG91_WIDGET_VERIFY_URL, null, {
        params: { 'access-token': accessToken },
        headers: { authkey: authKey },
        timeout: 5000,
      });

      const responseData = response.data;
      if (responseData.type !== 'success') {
        logger.error({ responseData }, 'Widget Verify: MSG91 API returned error in body');
        throw new UnauthorizedError('Invalid or expired MSG91 access token');
      }

      logger.info({ status: response.status }, 'Widget Verify: MSG91 API Success');
      // On success, `message` holds the verified identifier (mobile number with country code)
      return String(responseData.message);
    } catch (error: any) {
      if (error instanceof UnauthorizedError) throw error;

      logger.error(
        {
          errorStatus: error.response?.status,
          errorData: error.response?.data,
          errorMessage: error.message,
        },
        'Widget Verify: MSG91 API Failed',
      );
      throw new UnauthorizedError('Invalid or expired MSG91 access token');
    }
  }

  /**
   * Send OTP to a phone number.
   * - 2factor: 2factor.in generates the OTP, we store it in Redis (single key per
   *   phone, 5-min expiry). A new OTP overwrites the old one, so the key always
   *   holds the latest OTP; verify reads and deletes it.
   * - msg91: MSG91 generates and manages the OTP.
   */
  async sendOtp(phone: string): Promise<{ success: boolean; message: string }> {
    if (!phone || phone.length !== 10) {
      throw new BadRequestError('Phone number must be 10 digits');
    }

    // Abuse guard: cap OTP sends per phone within the configured window.
    await assertOtpRateLimit(phone);

    const provider = config.communication.sms.provider;
    if (provider === '2factor') {
      const apiKey = config.communication.sms.twoFactor.apiKey;
      const templateName = config.communication.sms.twoFactor.templateName;

      if (!apiKey) {
        logger.error('TWO_FACTOR_API_KEY not configured');
        throw new Error('TWO_FACTOR_API_KEY not configured');
      }
      if (!templateName) {
        logger.error('TWO_FACTOR_TEMPLATE_NAME not configured');
        throw new Error('TWO_FACTOR_TEMPLATE_NAME not configured');
      }

      const url = `${TWO_FACTOR_OTP_URL}/${apiKey}/SMS/${phone}/AUTOGEN2/${templateName}`;
      logger.info(
        { provider, phone, url: url.replace(apiKey, '***API_KEY***') },
        'OTP Send: Calling 2factor.in',
      );
      if (config.env === 'development') {
        await recordOtpSent(phone);
        return {
          success: true,
          message: 'OTP sent successfully',
        };
      }
      try {
        const response = await axios.get(url, {
          timeout: 10000,
        });

        const data = response.data;
        logger.info(
          { phone, status: data.Status, responseData: data },
          'OTP Send: 2factor response',
        );

        if (data.Status !== 'Success' || !data.OTP) {
          logger.error({ phone, data }, 'OTP Send: 2factor returned an error');
          throw new Error('Failed to send OTP');
        }

        // Store latest OTP in Redis (single key per phone, overwrites old, 5-min expiry)
        await getRedisClient().set(getOtpRedisKey(phone), data.OTP, 'EX', 300);

        await recordOtpSent(phone);

        return {
          success: true,
          message: 'OTP sent successfully',
        };
      } catch (error: any) {
        logger.error(
          {
            phone,
            provider,
            errorMessage: error.message,
            errorStatus: error.response?.status,
            errorData: error.response?.data,
          },
          'OTP Send: 2factor API Failed',
        );
        throw new Error(`Failed to send OTP: ${error.response?.data?.Message || error.message}`);
      }
    }

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

      await recordOtpSent(phone);

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
   * Verify OTP.
   * - 2factor: validates against the OTP stored in Redis, then deletes the key.
   * - msg91: validates against MSG91's stored OTP.
   */
  async verifyOtp(phone: string, otp: string): Promise<boolean> {
    if (!phone || phone.length !== 10) {
      throw new BadRequestError('Phone number must be 10 digits');
    }

    if (!otp || otp.length !== 6) {
      throw new BadRequestError('OTP must be 6 digits');
    }
    if (config.env === 'development') {
      return true;
    }
    if (config.communication.sms.provider === '2factor') {
      const redis = getRedisClient();
      const redisKey = getOtpRedisKey(phone);

      const storedOtp = await redis.get(redisKey);

      if (!storedOtp) {
        logger.warn({ phone }, 'OTP Verify: No OTP found in Redis or expired');
        throw new UnauthorizedError('Invalid or expired OTP');
      }

      if (storedOtp !== otp) {
        logger.warn({ phone }, 'OTP Verify: Provided OTP did not match');
        throw new UnauthorizedError('Invalid OTP');
      }

      await redis.del(redisKey);
      logger.info({ phone }, 'OTP Verify: OTP validated and Redis key deleted');
      return true;
    }

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

      // MSG91 returns 200 even on errors - check response body, not just status
      const responseData = response.data;
      if (responseData.type === 'error' || !responseData.success) {
        logger.error({ phone, responseData }, 'OTP Verify: MSG91 API returned error in body');
        throw new UnauthorizedError('Invalid or expired OTP');
      }

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
   * Resend OTP.
   * - 2factor: just send a fresh OTP (overwrites the Redis key).
   * - msg91: use MSG91 retry endpoint.
   */
  async resendOtp(phone: string): Promise<{ success: boolean; message: string }> {
    if (!phone || phone.length !== 10) {
      throw new BadRequestError('Phone number must be 10 digits');
    }

    if (config.communication.sms.provider === '2factor') {
      return this.sendOtp(phone);
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
