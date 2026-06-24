import pino from 'pino';
import path from 'path';
import { config } from '../config';

const logsDir = path.join(process.cwd(), 'logs', 'logs');

export const logger = pino({
  level: config.log.level,
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: {
    targets: [
      ...(config.env === 'development'
        ? [
            {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
                singleLine: true,
              },
            },
          ]
        : [
            {
              target: 'pino/file',
              options: {
                destination: 1, // stdout
              },
            },
          ]),
      {
        target: 'pino-roll',
        options: {
          file: path.join(logsDir, 'app'),
          mkdir: true,
          frequency: 'daily',
          size: '10m',
        },
      },
    ],
  },
});
