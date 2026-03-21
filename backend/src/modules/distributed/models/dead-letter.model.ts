import mongoose, { Document, Schema } from 'mongoose';

export interface IDeadLetterDoc extends Document {
  queueName: string;
  jobName: string;
  jobData: Record<string, unknown>;
  failedReason: string;
  attemptsMade: number;
  originalJobId: string;
  resolvedAt: Date | null;
  createdAt: Date;
}

const deadLetterSchema = new Schema<IDeadLetterDoc>(
  {
    queueName: { type: String, required: true },
    jobName: { type: String, required: true },
    jobData: { type: Schema.Types.Mixed, default: {} },
    failedReason: { type: String, default: '' },
    attemptsMade: { type: Number, default: 0 },
    originalJobId: { type: String, default: '' },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

deadLetterSchema.index({ queueName: 1, createdAt: -1 });
deadLetterSchema.index({ resolvedAt: 1 });

export const DeadLetter = mongoose.model<IDeadLetterDoc>('DeadLetter', deadLetterSchema);
