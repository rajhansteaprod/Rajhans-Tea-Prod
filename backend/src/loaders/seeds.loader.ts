import { config } from '../config';
import { logger } from '../utils/logger';
import { seedPages } from '../seeds/pages.seed';

export const runSeeds = async (): Promise<void> => {
  if (config.env === 'test') {
    logger.debug('Skipping seeds in test environment');
    return;
  }

  try {
    console.log('🔄 [runSeeds] Starting seed execution...');
    logger.info('Running database seeds...');
    await seedPages();
    logger.info('All seeds completed successfully');
    console.log('✅ [runSeeds] Seeds execution completed');
  } catch (error) {
    console.error('❌ [runSeeds] Seeding failed:', error);
    logger.error({ error }, 'Seeding failed');
    throw error;
  }
};
