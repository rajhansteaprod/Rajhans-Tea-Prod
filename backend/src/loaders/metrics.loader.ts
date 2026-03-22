import client from 'prom-client';
import { logger } from '../utils/logger';

export const initMetrics = (): void => {
  client.collectDefaultMetrics({
    prefix: 'rajhans_tea_',
  });
  logger.info('Prometheus metrics initialized');
};
