import { NotificationProvider } from './provider.interface';
import { EmailProvider } from './email.provider';
import { SMSProvider } from './sms.provider';
import { PushProvider } from './push.provider';

const cache = new Map<string, NotificationProvider>();

export function getNotificationProvider(channel: 'email' | 'sms' | 'push'): NotificationProvider {
  if (cache.has(channel)) return cache.get(channel)!;

  let provider: NotificationProvider;
  switch (channel) {
    case 'email':
      provider = new EmailProvider();
      break;
    case 'sms':
      provider = new SMSProvider();
      break;
    case 'push':
      provider = new PushProvider();
      break;
  }

  cache.set(channel, provider);
  return provider;
}
