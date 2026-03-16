import mongoose from 'mongoose';
import { config } from '../config';
import { logger } from '../utils/logger';

export const connectMongoDB = async (): Promise<void> => {
  const uri = config.env === 'test' ? config.mongo.testUri : config.mongo.uri;

  try {
    await mongoose.connect(uri);
    logger.info(`MongoDB connected: ${mongoose.connection.host}`);
  } catch (error) {
    logger.fatal({ error }, 'MongoDB connection failed');
    process.exit(1);
  }

  mongoose.connection.on('error', (error) => {
    logger.error({ error }, 'MongoDB connection error');
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });
};

export const disconnectMongoDB = async (): Promise<void> => {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected gracefully');
};
