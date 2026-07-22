import { pino } from 'pino';
import config from '../config/index.js';

const transport =
  config.NODE_ENV === 'development'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined;

export const logger = pino({
  level: config.LOG_LEVEL,
  transport,
  base: {
    service: 'auto-mat-ion',
  },
});

export function createLogger(module: string) {
  return logger.child({ module });
}

export default logger;
