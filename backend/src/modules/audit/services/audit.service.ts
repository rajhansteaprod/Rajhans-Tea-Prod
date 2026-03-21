import { Types } from 'mongoose';
import { AuditLog } from '../models/audit-log.model';
import { parsePagination, buildPaginationMeta } from '../../../utils/pagination';
import { logger } from '../../../utils/logger';

export interface AuditLogInput {
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

export class AuditService {
  /**
   * Fire-and-forget audit log. Never throws — silently fails.
   */
  async log(entry: AuditLogInput): Promise<void> {
    try {
      await AuditLog.create({
        userId: entry.userId ? new Types.ObjectId(entry.userId) : null,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId || null,
        details: entry.details || {},
        ip: entry.ip || '',
        userAgent: entry.userAgent || '',
      });
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Audit log write failed');
    }
  }

  async search(
    filters: { action?: string; resource?: string; userId?: string; startDate?: string; endDate?: string },
    query: { page?: number; limit?: number } = {},
  ) {
    const { page, limit, skip } = parsePagination(query);
    const filter: Record<string, unknown> = {};
    if (filters.action) filter.action = { $regex: filters.action, $options: 'i' };
    if (filters.resource) filter.resource = filters.resource;
    if (filters.userId) filter.userId = new Types.ObjectId(filters.userId);
    if (filters.startDate || filters.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (filters.startDate) dateFilter.$gte = new Date(filters.startDate);
      if (filters.endDate) dateFilter.$lte = new Date(filters.endDate);
      filter.createdAt = dateFilter;
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('userId', 'phone firstName lastName role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      AuditLog.countDocuments(filter).exec(),
    ]);
    return { logs, meta: buildPaginationMeta(page, limit, total) };
  }

  async getRecent(limit = 20) {
    return AuditLog.find()
      .populate('userId', 'phone firstName lastName')
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }
}
