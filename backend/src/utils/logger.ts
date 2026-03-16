import pino from 'pino';
import { config } from '../config';

export const logger = pino({
  level: config.log.level,
  ...(config.env === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
});
