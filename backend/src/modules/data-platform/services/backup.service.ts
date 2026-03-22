import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { Types } from 'mongoose';
import { BackupRecord } from '../models/backup-record.model';
import { config } from '../../../config';
import { logger } from '../../../utils/logger';

const execAsync = promisify(exec);
const BACKUP_DIR = path.join(process.cwd(), 'backups');

// Core collections to backup
const COLLECTIONS = [
  'users',
  'products',
  'categories',
  'collections',
  'orders',
  'payments',
  'carts',
  'wishlists',
  'wallets',
  'wallettransactions',
  'invoices',
  'reviews',
  'coupons',
  'storesettings',
  'featureflags',
];

export class BackupService {
  constructor() {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
  }

  /**
   * Run a MongoDB backup (mongodump).
   * In Docker, mongodump runs inside the mongo container.
   */
  async runBackup(type: 'scheduled' | 'manual', triggeredBy?: string): Promise<string> {
    const record = await BackupRecord.create({
      type,
      status: 'running',
      collections: COLLECTIONS,
      triggeredBy: triggeredBy ? new Types.ObjectId(triggeredBy) : null,
      startedAt: new Date(),
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}`);

    try {
      // Use mongodump (available in MongoDB container)
      const mongoUri = config.mongo.uri;
      const cmd = `mongodump --uri="${mongoUri}" --out="${backupPath}" --quiet`;

      logger.info({ backupId: record._id, path: backupPath }, 'Starting backup');
      await execAsync(cmd, { timeout: 300000 }); // 5 min timeout

      // Calculate size
      let totalSize = 0;
      try {
        const files = this.getFilesRecursive(backupPath);
        totalSize = files.reduce((sum, f) => sum + fs.statSync(f).size, 0);
      } catch {
        /* size unknown */
      }

      record.status = 'completed';
      record.path = backupPath;
      record.sizeBytes = totalSize;
      record.completedAt = new Date();
      await record.save();

      logger.info({ backupId: record._id, sizeBytes: totalSize }, 'Backup completed');
      return record._id.toString();
    } catch (err: any) {
      record.status = 'failed';
      record.error = err.message;
      record.completedAt = new Date();
      await record.save();

      logger.error({ backupId: record._id, error: err.message }, 'Backup failed');
      return record._id.toString();
    }
  }

  async getHistory(limit = 20) {
    return BackupRecord.find()
      .populate('triggeredBy', 'phone firstName')
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  async getLatest() {
    return BackupRecord.findOne({ status: 'completed' }).sort({ createdAt: -1 }).exec();
  }

  async getStats() {
    const [total, completed, failed, latest] = await Promise.all([
      BackupRecord.countDocuments().exec(),
      BackupRecord.countDocuments({ status: 'completed' }).exec(),
      BackupRecord.countDocuments({ status: 'failed' }).exec(),
      this.getLatest(),
    ]);

    return {
      total,
      completed,
      failed,
      lastBackup: latest
        ? {
            date: latest.completedAt,
            sizeMB: +(latest.sizeBytes / 1024 / 1024).toFixed(2),
            type: latest.type,
          }
        : null,
    };
  }

  private getFilesRecursive(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) files.push(...this.getFilesRecursive(full));
      else files.push(full);
    }
    return files;
  }
}
