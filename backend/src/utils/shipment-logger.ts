import pino from 'pino';
import path from 'path';

const logsDir = path.join(process.cwd(), 'logs');

export const shipmentLogger = pino({
  level: 'debug',
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: {
    targets: [
      {
        target: 'pino-pretty',
        options: {
          destination: path.join(logsDir, 'shipment.log'),
          mkdir: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          singleLine: false,
          colorize: false,
        },
      },
    ],
  },
});
