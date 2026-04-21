import pino from 'pino';
import path from 'path';
import { config } from '../config';

const logsDir = path.join(process.cwd(), 'logs');

export const logger = pino({
  level: config.log.level,
  transport: {
    targets: [
      ...(config.env === 'development' ? [{
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }] : []),
      {
        target: 'pino/file',
        options: {
          destination: path.join(logsDir, 'app.log'),
          mkdir: true,
        },
      },
    ],
  },
});
