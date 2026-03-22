import { Request, Response } from 'express';
import { AuditService } from './services/audit.service';
import { sendSuccess, sendPaginated } from '../../utils/api-response';

const auditService = new AuditService();

export const getAuditLogs = async (req: Request, res: Response) => {
  const { action, resource, userId, startDate, endDate, page, limit } = req.query as Record<
    string,
    string | undefined
  >;
  const result = await auditService.search(
    { action, resource, userId, startDate, endDate },
    { page: page ? parseInt(page, 10) : undefined, limit: limit ? parseInt(limit, 10) : undefined },
  );
  sendPaginated(res, result.logs, result.meta, 'Audit logs');
};

export const getRecentActivity = async (_req: Request, res: Response) => {
  const logs = await auditService.getRecent(20);
  sendSuccess(res, logs);
};
