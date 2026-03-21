import nodemailer from 'nodemailer';
import { config } from '../../../../config';
import { logger } from '../../../../utils/logger';
import { NotificationProvider, NotificationPayload, SendResult } from './provider.interface';

export class EmailProvider implements NotificationProvider {
  readonly channel = 'email' as const;
  private transporter: nodemailer.Transporter | null = null;

  private getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      const smtp = config.communication.email.smtp;
      if (!smtp.host || !smtp.user) {
        logger.warn('Email SMTP not configured');
        throw new Error('Email not configured');
      }
      this.transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: { user: smtp.user, pass: smtp.pass },
      });
    }
    return this.transporter;
  }

  async send(payload: NotificationPayload): Promise<SendResult> {
    try {
      const smtp = config.communication.email.smtp;
      const info = await this.getTransporter().sendMail({
        from: smtp.from,
        to: payload.to,
        subject: payload.subject || payload.title || 'Rajhans Ecommerce',
        html: payload.html || `<p>${payload.body}</p>`,
        text: payload.body,
      });
      return { success: true, providerMessageId: info.messageId };
    } catch (err: any) {
      logger.error({ err: err.message, to: payload.to }, 'Email send failed');
      return { success: false, error: err.message };
    }
  }
}
