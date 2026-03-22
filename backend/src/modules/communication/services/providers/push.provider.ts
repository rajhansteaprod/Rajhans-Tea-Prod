import { logger } from '../../../../utils/logger';
import { NotificationProvider, NotificationPayload, SendResult } from './provider.interface';
import { FcmTokenRepository } from '../../repositories/fcm-token.repository';

export class PushProvider implements NotificationProvider {
  readonly channel = 'push' as const;
  private fcmTokenRepo = new FcmTokenRepository();

  async send(payload: NotificationPayload): Promise<SendResult> {
    try {
      // payload.to = userId (we need to lookup FCM tokens)
      const tokens = await this.fcmTokenRepo.getTokensForUser(payload.to);
      if (tokens.length === 0) {
        return { success: false, error: 'No FCM tokens registered' };
      }

      // Use Firebase Admin SDK (already initialized by firebase.loader)
      const admin = await import('firebase-admin');
      const messaging = admin.default.messaging();

      let successCount = 0;
      for (const token of tokens) {
        try {
          await messaging.send({
            token,
            notification: {
              title: payload.title || 'RnD Ecommerce',
              body: payload.body,
            },
            webpush: payload.link ? { fcmOptions: { link: payload.link } } : undefined,
          });
          successCount++;
        } catch (err: any) {
          // Token might be stale
          if (
            err.code === 'messaging/registration-token-not-registered' ||
            err.code === 'messaging/invalid-registration-token'
          ) {
            await this.fcmTokenRepo.removeStaleToken(token);
          }
          logger.warn({ token: token.slice(0, 10), err: err.message }, 'FCM send failed for token');
        }
      }

      return {
        success: successCount > 0,
        providerMessageId: `fcm-${successCount}/${tokens.length}`,
      };
    } catch (err: any) {
      logger.error({ err: err.message }, 'Push notification failed');
      return { success: false, error: err.message };
    }
  }
}
