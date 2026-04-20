import { Newsletter } from './newsletter.model';
import { logger } from '../../utils/logger';

export class NewsletterService {
  /**
   * Subscribe email to newsletter
   */
  async subscribe(email: string): Promise<{ email: string; createdAt: Date }> {
    const normalizedEmail = email.trim().toLowerCase();

    // Validate email format
    if (!this.isValidEmail(normalizedEmail)) {
      throw new Error('Invalid email format');
    }

    try {
      // Check if already subscribed
      const existing = await Newsletter.findOne({ email: normalizedEmail });
      if (existing && existing.status === 'active') {
        // Email already subscribed, don't reveal it (privacy)
        throw new Error('Email is already subscribed');
      }

      // If previously unsubscribed, reactivate
      if (existing && existing.status === 'inactive') {
        existing.status = 'active';
        existing.unsubscribedAt = null;
        existing.unsubscribeReason = undefined;
        await existing.save();
        return { email: existing.email, createdAt: existing.createdAt };
      }

      // Create new subscription
      const subscription = await Newsletter.create({
        email: normalizedEmail,
        subscribedAt: new Date(),
        status: 'active',
      });

      return {
        email: subscription.email,
        createdAt: subscription.createdAt,
      };
    } catch (error: any) {
      logger.error(`Newsletter subscription error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Unsubscribe email from newsletter
   */
  async unsubscribe(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();

    try {
      const subscription = await Newsletter.findOne({ email: normalizedEmail });
      if (!subscription) {
        throw new Error('Email not found in newsletter');
      }

      subscription.status = 'inactive';
      subscription.unsubscribedAt = new Date();
      await subscription.save();
    } catch (error: any) {
      logger.error(`Newsletter unsubscription error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Get subscriber count (for analytics - admin only)
   */
  async getSubscriberCount(): Promise<number> {
    return Newsletter.countDocuments({ status: 'active' });
  }

  /**
   * Get all active subscribers (admin only)
   */
  async getSubscribers(limit: number = 100, page: number = 1) {
    const skip = (page - 1) * limit;
    const subscribers = await Newsletter.find({ status: 'active' })
      .select('email subscribedAt')
      .limit(limit)
      .skip(skip)
      .sort({ subscribedAt: -1 });

    const total = await this.getSubscriberCount();

    return {
      data: subscribers,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }
}
