export interface NotificationPayload {
  to: string;
  subject?: string;
  title?: string;
  body: string;
  html?: string;
  link?: string;
}

export interface SendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface NotificationProvider {
  readonly channel: 'email' | 'sms' | 'push';
  send(payload: NotificationPayload): Promise<SendResult>;
}
