import pino from 'pino';
import path from 'path';

const logsDir = path.join(process.cwd(), 'logs', 'shipmentlogs');

export const shipmentLogger = pino({
  level: 'debug',
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: {
    targets: [
      {
        target: 'pino-roll',
        options: {
          file: path.join(logsDir, 'shipment'),
          mkdir: true,
          frequency: 'daily',
          size: '10m',
        },
      },
    ],
  },
});
