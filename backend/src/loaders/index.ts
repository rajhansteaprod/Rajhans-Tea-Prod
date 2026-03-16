import { connectMongoDB } from './mongoose.loader';
import { connectRedis } from './redis.loader';
import { initMetrics } from './metrics.loader';
import { initFirebase } from './firebase.loader';
import { logger } from '../utils/logger';

export const initializeLoaders = async (): Promise<void> => {
  logger.info('Initializing application loaders...');

  await connectMongoDB();
  connectRedis();
  initMetrics();
  initFirebase();

  logger.info('All loaders initialized successfully');
};

export { disconnectMongoDB } from './mongoose.loader';
export { disconnectRedis, getRedisClient } from './redis.loader';
export { getFirebaseAuth } from './firebase.loader';
