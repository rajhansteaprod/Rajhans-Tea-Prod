import client from 'prom-client';
import { logger } from '../utils/logger';

export const initMetrics = (): void => {
  client.collectDefaultMetrics({
    prefix: 'rnd_',
  });
  logger.info('Prometheus metrics initialized');
};
