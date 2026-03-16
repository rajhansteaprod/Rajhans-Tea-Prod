import './types/express';
import app from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { initializeLoaders, disconnectMongoDB, disconnectRedis } from './loaders';

const startServer = async () => {
  await initializeLoaders();

  const server = app.listen(config.port, () => {
    logger.info(`Server running on port ${config.port} in ${config.env} mode`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received. Starting graceful shutdown...`);

    server.close(async () => {
      logger.info('HTTP server closed');
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
