import { logger } from '../utils/logger';

interface EnvVar {
  name: string;
  required: boolean;
  default?: string;
}

const ENV_VARS: EnvVar[] = [
  // Required
  { name: 'NODE_ENV', required: true, default: 'development' },
  { name: 'PORT', required: true, default: '3000' },
  { name: 'MONGO_URI', required: true },
  { name: 'REDIS_HOST', required: true, default: 'localhost' },
  { name: 'JWT_ACCESS_SECRET', required: true },
  { name: 'JWT_REFRESH_SECRET', required: true },

  // Optional (warn if missing)
  { name: 'RAZORPAY_KEY_ID', required: false },
  { name: 'RAZORPAY_KEY_SECRET', required: false },
  { name: 'CORS_ORIGIN', required: false, default: 'http://localhost:4200' },
  { name: 'SMTP_HOST', required: false },
  { name: 'MSG91_AUTH_KEY', required: false },
  { name: 'SHIPROCKET_EMAIL', required: false },
];

/**
 * Validates environment variables on startup.
 * Logs warnings for missing optional vars, throws for missing required vars.
 */
export function validateEnvironment(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const v of ENV_VARS) {
    const value = process.env[v.name];
    if (!value && !v.default) {
      if (v.required) {
        errors.push(`Missing required env var: ${v.name}`);
      } else {
        warnings.push(`Missing optional env var: ${v.name}`);
      }
    }
  }

  for (const warn of warnings) {
    logger.warn(warn);
  }

  if (errors.length > 0) {
    for (const err of errors) {
      logger.error(err);
    }
    // In production, fail fast. In development, warn but continue.
    if (process.env.NODE_ENV === 'production') {
      logger.fatal('Missing required environment variables — cannot start in production');
      process.exit(1);
    } else {
      logger.warn('Missing required env vars — continuing in development mode');
    }
  }

  logger.info('Environment validation complete');
}
