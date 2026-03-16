import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { getRedisClient } from '../../../loaders';
import { logger } from '../../../utils/logger';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'OK',
    data: {
      status: 'healthy',
      uptime: `${Math.floor(uptime)}s`,
      timestamp: new Date().toISOString(),
      memory: {
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      },
    },
  });
});

router.get('/health/ready', async (_req: Request, res: Response) => {
  const checks: Record<string, string> = {};

  // MongoDB check
  try {
    const mongoState = mongoose.connection.readyState;
    checks.mongodb = mongoState === 1 ? 'connected' : 'disconnected';
  } catch {
    checks.mongodb = 'error';
  }

  // Redis check
  try {
    const redis = getRedisClient();
    await redis.ping();
    checks.redis = 'connected';
  } catch {
    checks.redis = 'error';
  }

  const allHealthy = Object.values(checks).every((s) => s === 'connected');

  if (!allHealthy) {
    logger.warn({ checks }, 'Readiness check failed');
  }

  res.status(allHealthy ? 200 : 503).json({
    success: allHealthy,
    statusCode: allHealthy ? 200 : 503,
    message: allHealthy ? 'Ready' : 'Not ready',
    data: { checks },
  });
});

export default router;
