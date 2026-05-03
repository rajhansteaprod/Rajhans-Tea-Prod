import { config } from '../config';
import { logger } from '../utils/logger';
import { seedPages } from '../seeds/pages.seed';

export const runSeeds = async (): Promise<void> => {
  if (config.env === 'test') {
    logger.debug('Skipping seeds in test environment');
    return;
  }

  try {
    console.log('\n🔄 [runSeeds] Starting seed execution...');
    logger.info('Running database seeds...');
    await seedPages();
    logger.info('All seeds completed successfully');
    console.log('✅ [runSeeds] Seeds execution completed\n');
  } catch (error) {
    console.error('\n❌ [runSeeds] Seeding failed - Details below:');
    console.error(error);
    logger.error({ error }, 'Seeding failed (non-fatal, server continuing)');
  }
};
