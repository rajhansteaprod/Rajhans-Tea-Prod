import './types/express';
import dns from 'dns';
import http from 'http';
import app from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { initializeLoaders, disconnectMongoDB, disconnectRedis, disconnectBullMQ } from './loaders';
import { registerWorkers, closeWorkers } from './jobs/start-workers';
import { initSocket } from './loaders/socket.loader';
import { registerEventHandlers } from './core/event-handlers';
import { registerGlobalErrorHandlers } from './core/graceful-error-handler';
import { validateEnvironment } from './core/env-validator';
import { scheduleCartCleanup } from './modules/cart/jobs/cleanup.job';
import { scheduleWebhookRetry } from './modules/payments/jobs/webhook-retry.job';
import { scheduleSeoAudit } from './modules/seo/jobs/seo-audit.job';

// Force Node.js c-ares DNS to use Google DNS (IPv4 + IPv6)
// Prevents local router DNS from blocking MongoDB Atlas SRV lookups
dns.setServers(['8.8.8.8', '8.8.4.4', '2001:4860:4860::8888', '2001:4860:4860::8844']);


const startServer = async () => {
  validateEnvironment();
  registerGlobalErrorHandlers();
  await initializeLoaders();
  registerWorkers();
  scheduleCartCleanup();
  scheduleWebhookRetry();
  scheduleSeoAudit(); // daily 03:15 SEO audit → enqueues a BullMQ job (observe-only, no auto-fix)
  registerEventHandlers();

  const httpServer = http.createServer(app);
  initSocket(httpServer);

  const server = httpServer.listen(config.port, () => {
    logger.info(`Server running on port ${config.port} in ${config.env} mode`);
    console.log(`Server running on port ${config.port} in ${config.env} mode`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received. Starting graceful shutdown...`);

    server.close(async () => {
      logger.info('HTTP server closed');
      await closeWorkers();
      await disconnectBullMQ();
      await disconnectMongoDB();
      await disconnectRedis();
      logger.info('Graceful shutdown complete');
      process.exit(0);
    });

    // Force exit after 10s
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

startServer().catch((error) => {
  logger.fatal({ error }, 'Failed to start server');
  setTimeout(() => process.exit(1), 1000);
});
