import { config } from '../../../../config';
import { logger } from '../../../../utils/logger';
import { NotificationProvider, NotificationPayload, SendResult } from './provider.interface';

export class SMSProvider implements NotificationProvider {
  readonly channel = 'sms' as const;

  async send(payload: NotificationPayload): Promise<SendResult> {
    const smsConfig = config.communication.sms;
    if (!smsConfig.msg91.authKey) {
      logger.warn('SMS provider not configured');
      return { success: false, error: 'SMS not configured' };
    }

    try {
      const res = await fetch('https://api.msg91.com/api/v5/flow/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authkey: smsConfig.msg91.authKey,
        },
        body: JSON.stringify({
          sender: smsConfig.msg91.senderId,
          route: '4', // transactional
          country: '91',
          sms: [{ message: payload.body, to: [payload.to.replace(/^\+91/, '')] }],
        }),
      });

      const data = (await res.json()) as Record<string, any>;
      if (res.ok && data.type === 'success') {
        return { success: true, providerMessageId: data.request_id };
      }
      return { success: false, error: data.message || 'SMS send failed' };
    } catch (err: any) {
      logger.error({ err: err.message, to: payload.to }, 'SMS send failed');
      return { success: false, error: err.message };
    }
  }
}
