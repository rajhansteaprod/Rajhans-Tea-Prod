import { Request, Response } from 'express';
import { NewsletterService } from './newsletter.service';
import logger from '../../core/logger';

const newsletterService = new NewsletterService();

/**
 * Subscribe email to newsletter
 */
export async function subscribe(req: Request, res: Response): Promise<void> {
  const { email } = req.body;

  try {
    const result = await newsletterService.subscribe(email);

    logger.info(`Newsletter subscription: ${email}`);
    res.json({
      message: 'Successfully subscribed to newsletter',
      email: result.email,
    });
  } catch (error: any) {
    logger.error(`Newsletter subscription failed: ${error.message}`);
    res.status(400).json({
      error: error.message || 'Failed to subscribe. Please try again.',
    });
  }
}

/**
 * Unsubscribe email from newsletter
 */
export async function unsubscribe(req: Request, res: Response): Promise<void> {
  const { email } = req.body;

  try {
    await newsletterService.unsubscribe(email);

    logger.info(`Newsletter unsubscription: ${email}`);
    res.json({
      message: 'Successfully unsubscribed from newsletter',
      email: email.trim().toLowerCase(),
    });
  } catch (error: any) {
    logger.error(`Newsletter unsubscription failed: ${error.message}`);
    res.status(400).json({
      error: error.message || 'Failed to unsubscribe. Please try again.',
    });
  }
}
