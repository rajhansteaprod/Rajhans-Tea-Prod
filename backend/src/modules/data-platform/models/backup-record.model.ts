import mongoose, { Document, Schema, Types } from 'mongoose';

export type BackupStatus = 'running' | 'completed' | 'failed';

export interface IBackupRecordDoc extends Document {
  type: 'scheduled' | 'manual';
  status: BackupStatus;
  collections: string[];
  sizeBytes: number;
  path: string;
  error: string | null;
  startedAt: Date;
  completedAt: Date | null;
  triggeredBy: Types.ObjectId | null;
  createdAt: Date;
}

const backupRecordSchema = new Schema<IBackupRecordDoc>(
  {
    type: { type: String, enum: ['scheduled', 'manual'], required: true },
    status: { type: String, enum: ['running', 'completed', 'failed'], default: 'running' },
    collections: [{ type: String }],
    sizeBytes: { type: Number, default: 0 },
    path: { type: String, default: '' },
    error: { type: String, default: null },
    startedAt: { type: Date, default: () => new Date() },
    completedAt: { type: Date, default: null },
    triggeredBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

backupRecordSchema.index({ createdAt: -1 });

export const BackupRecord = mongoose.model<IBackupRecordDoc>('BackupRecord', backupRecordSchema);
