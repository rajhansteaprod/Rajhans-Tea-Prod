import mongoose from 'mongoose';
import { logger } from '../../../utils/logger';

/**
 * Archives old data to separate collections.
 * Moves documents older than threshold to *_archive collections.
 * Original documents are deleted after successful archive.
 */
export class ArchiveService {
  /**
   * Archive orders older than `days` to `orders_archive`.
   */
  async archiveOldOrders(days = 365): Promise<{ archived: number }> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const db = mongoose.connection.db;
    if (!db) return { archived: 0 };

    const source = db.collection('orders');
    const archive = db.collection('orders_archive');

    const docs = await source
      .find({
        status: 'delivered',
        createdAt: { $lt: cutoff },
      })
      .toArray();

    if (docs.length === 0) return { archived: 0 };

    await archive.insertMany(docs);
    const ids = docs.map((d) => d._id);
    await source.deleteMany({ _id: { $in: ids } });

    logger.info({ archived: docs.length, cutoffDate: cutoff }, 'Orders archived');
    return { archived: docs.length };
  }

  /**
   * Archive old audit logs (older than 90 days — TTL handles this, but manual archive keeps data).
   */
  async archiveOldAuditLogs(days = 90): Promise<{ archived: number }> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const db = mongoose.connection.db;
    if (!db) return { archived: 0 };

    const source = db.collection('auditlogs');
    const archive = db.collection('auditlogs_archive');

    const docs = await source.find({ createdAt: { $lt: cutoff } }).toArray();
    if (docs.length === 0) return { archived: 0 };

    await archive.insertMany(docs);
    await source.deleteMany({ _id: { $in: docs.map((d) => d._id) } });

    logger.info({ archived: docs.length }, 'Audit logs archived');
    return { archived: docs.length };
  }

  /**
   * Archive old search analytics.
   */
  async archiveOldSearchAnalytics(days = 90): Promise<{ archived: number }> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const db = mongoose.connection.db;
    if (!db) return { archived: 0 };

    const source = db.collection('searchanalytics');
    const archive = db.collection('searchanalytics_archive');

    const docs = await source.find({ createdAt: { $lt: cutoff } }).toArray();
    if (docs.length === 0) return { archived: 0 };

    await archive.insertMany(docs);
    await source.deleteMany({ _id: { $in: docs.map((d) => d._id) } });

    logger.info({ archived: docs.length }, 'Search analytics archived');
    return { archived: docs.length };
  }

  /**
   * Get archive stats.
   */
  async getArchiveStats(): Promise<{ collection: string; count: number }[]> {
    const db = mongoose.connection.db;
    if (!db) return [];

    const archiveCollections = ['orders_archive', 'auditlogs_archive', 'searchanalytics_archive'];
    const stats: { collection: string; count: number }[] = [];

    for (const name of archiveCollections) {
      try {
        const count = await db.collection(name).countDocuments();
        stats.push({ collection: name, count });
      } catch {
        stats.push({ collection: name, count: 0 });
      }
    }

    return stats;
  }
}
