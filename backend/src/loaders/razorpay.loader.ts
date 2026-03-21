import Razorpay from 'razorpay';
import { config } from '../config';
import { logger } from '../utils/logger';

let razorpayInstance: Razorpay | null = null;

export const initRazorpay = (): void => {
  if (!config.razorpay.keyId || !config.razorpay.keySecret) {
    logger.warn('Razorpay credentials not configured — payment features will be unavailable');
    return;
  }

  razorpayInstance = new Razorpay({
    key_id: config.razorpay.keyId,
    key_secret: config.razorpay.keySecret,
  });

  logger.info('Razorpay client initialized');
};

export const getRazorpayClient = (): Razorpay => {
  if (!razorpayInstance) {
    throw new Error('Razorpay not initialized. Call initRazorpay() first or check credentials.');
  }
  return razorpayInstance;
};
