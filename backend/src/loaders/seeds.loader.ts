import { config } from '../config';
import { logger } from '../utils/logger';
import { seedPages } from '../seeds/pages.seed';

export const runSeeds = async (): Promise<void> => {
  if (config.env === 'test') {
    logger.debug('Skipping seeds in test environment');
    return;
  }

  try {
    logger.info('🔄 Starting seed execution');
    await seedPages();
    logger.info('✅ All seeds completed successfully');
  } catch (error) {
    logger.error({ error }, 'Seeding failed (non-fatal, server continuing)');
  }
};
