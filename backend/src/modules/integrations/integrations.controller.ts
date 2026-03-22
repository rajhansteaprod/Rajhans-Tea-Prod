import { Request, Response } from 'express';
import { Types } from 'mongoose';
import crypto from 'crypto';
import { WebhookSubscription } from './models/webhook-subscription.model';
import { webhookDispatcher } from './services/webhook-dispatcher.service';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/api-response';
import { NotFoundError } from '../../utils/api-error';

// Available webhook events
const WEBHOOK_EVENTS = [
  'order.created',
  'order.shipped',
  'order.delivered',
  'order.cancelled',
  'payment.captured',
  'payment.refunded',
  'review.approved',
  'user.registered',
];

export const listWebhooks = async (_req: Request, res: Response) => {
  const webhooks = await WebhookSubscription.find().sort({ createdAt: -1 }).exec();
  sendSuccess(res, webhooks);
};

export const createWebhook = async (req: Request, res: Response) => {
  const { name, url, events } = req.body;
  const secret = crypto.randomBytes(32).toString('hex');
  const webhook = await WebhookSubscription.create({
    name,
    url,
    secret,
    events: events || WEBHOOK_EVENTS,
    createdBy: new Types.ObjectId(req.user!.userId),
  });
  sendCreated(res, webhook, 'Webhook created');
};

export const updateWebhook = async (req: Request, res: Response) => {
  const webhook = await WebhookSubscription.findByIdAndUpdate(
    req.params['id'],
    { $set: req.body },
    { new: true },
  ).exec();
  if (!webhook) throw new NotFoundError('Webhook not found');
  sendSuccess(res, webhook, 'Webhook updated');
};

export const deleteWebhook = async (req: Request, res: Response) => {
  await WebhookSubscription.findByIdAndDelete(req.params['id']).exec();
  sendNoContent(res);
};

export const toggleWebhook = async (req: Request, res: Response) => {
  const webhook = await WebhookSubscription.findById(req.params['id']).exec();
  if (!webhook) throw new NotFoundError('Webhook not found');
  webhook.isActive = !webhook.isActive;
  webhook.failCount = 0;
  await webhook.save();
  sendSuccess(res, webhook, webhook.isActive ? 'Enabled' : 'Disabled');
};

export const testWebhook = async (req: Request, res: Response) => {
  const webhook = await WebhookSubscription.findById(req.params['id']).exec();
  if (!webhook) throw new NotFoundError('Webhook not found');

  // Send test event
  await webhookDispatcher.dispatch('test.ping', {
    message: 'Test webhook from RnD Ecommerce',
    timestamp: new Date().toISOString(),
  });
  sendSuccess(res, { tested: true }, 'Test event dispatched');
};

export const getAvailableEvents = async (_req: Request, res: Response) => {
  sendSuccess(res, WEBHOOK_EVENTS);
};

export const getIntegrationHealth = async (_req: Request, res: Response) => {
  const health = await webhookDispatcher.getIntegrationHealth();
  const webhookCount = await WebhookSubscription.countDocuments({ isActive: true }).exec();
  sendSuccess(res, { integrations: health, activeWebhooks: webhookCount });
};
