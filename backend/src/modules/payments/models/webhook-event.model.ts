import mongoose, { Document, Schema } from 'mongoose';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WebhookEventStatus = 'received' | 'processing' | 'processed' | 'failed' | 'dead_lettered';

export interface IWebhookEventDoc extends Document {
  razorpayEventId: string; // e.g. "ch_1234567890" — THE IDEMPOTENCY KEY (UNIQUE)
  eventType: string; // "payment.captured" | "payment.failed" | "refund.created"
  payload: object; // Raw webhook payload from Razorpay
  status: WebhookEventStatus; // Lifecycle: received → processing → processed OR dead_lettered
  retryCount: number; // How many times has this been retried
  maxRetries: number; // Default 5, configurable
  processingError: string | null; // Last error message for debugging
  nextRetryAt: Date | null; // When to retry next (null if not in retry)
  processedAt: Date | null; // When successfully processed
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const webhookEventSchema = new Schema<IWebhookEventDoc>(
  {
    razorpayEventId: { type: String, required: true }, // UNIQUE — the idempotency key
    eventType: { type: String, required: true }, // "payment.captured", "payment.failed", etc.
    payload: { type: Schema.Types.Mixed, required: true }, // Raw Razorpay payload
    status: {
      type: String,
      enum: ['received', 'processing', 'processed', 'failed', 'dead_lettered'],
      default: 'received',
    },
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 5 },
    processingError: { type: String, default: null },
    nextRetryAt: { type: Date, default: null },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// UNIQUE on razorpayEventId — this is the idempotency guard
// Two webhooks with same razorpayEventId cannot both exist
webhookEventSchema.index({ razorpayEventId: 1 }, { unique: true });

// Compound index for retry polling: find failed events that are ready to retry
webhookEventSchema.index({ status: 1, nextRetryAt: 1 });

// For admin listing/debugging
webhookEventSchema.index({ createdAt: -1 });

// For finding events by type (e.g., only payment.captured)
webhookEventSchema.index({ eventType: 1 });

// ─── Model ────────────────────────────────────────────────────────────────────

export const WebhookEvent = mongoose.model<IWebhookEventDoc>('WebhookEvent', webhookEventSchema);
