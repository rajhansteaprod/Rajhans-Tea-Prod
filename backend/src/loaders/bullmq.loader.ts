import IORedis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';

let bullmqConnection: IORedis | null = null;

/**
 * Returns raw connection options for BullMQ queues/workers.
 * BullMQ creates its own ioredis instances internally, so we pass config, not a client.
 */
export const getBullMQConnectionOpts = () => ({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: null as null, // required by BullMQ
  enableReadyCheck: false,
});

/**
 * Dedicated Redis connection for BullMQ health checks / monitoring.
 */
export const connectBullMQ = (): IORedis => {
  bullmqConnection = new IORedis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  bullmqConnection.on('connect', () => {
    logger.info('BullMQ Redis connected');
  });

  bullmqConnection.on('error', (error) => {
    logger.error({ error }, 'BullMQ Redis connection error');
  });

  return bullmqConnection;
};

export const disconnectBullMQ = async (): Promise<void> => {
  if (bullmqConnection) {
    await bullmqConnection.quit();
    logger.info('BullMQ Redis disconnected gracefully');
  }
};
