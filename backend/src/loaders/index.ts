import { connectMongoDB } from './mongoose.loader';
import { connectRedis } from './redis.loader';
import { connectBullMQ } from './bullmq.loader';
import { initMetrics } from './metrics.loader';
import { initFirebase } from './firebase.loader';
import { initRazorpay } from './razorpay.loader';
import { runSeeds } from './seeds.loader';
import { logger } from '../utils/logger';

export const initializeLoaders = async (): Promise<void> => {
  logger.info('Initializing application loaders...');

  await connectMongoDB();
  connectRedis();
  connectBullMQ();
  initMetrics();
  initFirebase();
  initRazorpay();
  await runSeeds();

  logger.info('All loaders initialized successfully');
};

export { disconnectMongoDB } from './mongoose.loader';
export { disconnectRedis, getRedisClient } from './redis.loader';
export { disconnectBullMQ } from './bullmq.loader';
export { getRazorpayClient } from './razorpay.loader';
export { getFirebaseAuth } from './firebase.loader';
