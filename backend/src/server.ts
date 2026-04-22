import './types/express';
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

const startServer = async () => {
  validateEnvironment();
  registerGlobalErrorHandlers();
  await initializeLoaders();
  registerWorkers();
  scheduleCartCleanup();
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
  process.exit(1);
});
