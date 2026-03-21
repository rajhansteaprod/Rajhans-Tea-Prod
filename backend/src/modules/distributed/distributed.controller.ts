import { Request, Response } from 'express';
import { QueueMonitorService } from './services/queue-monitor.service';
import { sendSuccess, sendPaginated } from '../../utils/api-response';
import os from 'os';

const monitorService = new QueueMonitorService();

export const getQueueHealth = async (_req: Request, res: Response) => {
  const health = await monitorService.getQueueHealth();
  sendSuccess(res, health);
};

export const getSystemHealth = async (_req: Request, res: Response) => {
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();

  sendSuccess(res, {
    status: 'ok',
    uptime: Math.floor(uptime),
    uptimeHuman: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
    },
    os: {
      platform: os.platform(),
      cpus: os.cpus().length,
      totalMemMB: Math.round(os.totalmem() / 1024 / 1024),
      freeMemMB: Math.round(os.freemem() / 1024 / 1024),
    },
    nodeVersion: process.version,
  });
};

export const getDeadLetters = async (req: Request, res: Response) => {
  const { page, limit, queueName } = req.query as Record<string, string | undefined>;
  const result = await monitorService.getDeadLetters({
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
    queueName,
  });
  sendPaginated(res, result.items, result.meta, 'Dead letters');
};

export const retryDeadLetter = async (req: Request, res: Response) => {
  const success = await monitorService.retryDeadLetter(req.params['id'] as string);
  sendSuccess(res, { retried: success }, success ? 'Job requeued' : 'Retry failed');
};

export const resolveDeadLetter = async (req: Request, res: Response) => {
  await monitorService.resolveDeadLetter(req.params['id'] as string);
  sendSuccess(res, { resolved: true });
};

export const getDeadLetterStats = async (_req: Request, res: Response) => {
  const stats = await monitorService.getDeadLetterStats();
  sendSuccess(res, stats);
};
