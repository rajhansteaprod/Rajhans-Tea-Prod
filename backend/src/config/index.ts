import dotenv from 'dotenv';
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  mongo: {
    uri: process.env.MONGO_URI || 'mongodb://localhost:27017/rajhans-tea',
    testUri: process.env.MONGO_TEST_URI || 'mongodb://localhost:27018/rajhans-tea-test',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    authMaxRequests: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || '10', 10),
  },
  cors: {
    origin: (process.env.CORS_ORIGIN || 'http://localhost:4200').split(',').map(s => s.trim()),
  },
  firebase: {
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
  communication: {
    email: {
      smtp: {
        host: process.env.SMTP_HOST || '',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
        from: process.env.SMTP_FROM || 'Rajhans Tea <noreply@rajhanstea.com>',
      },
    },
    sms: {
      provider: process.env.SMS_PROVIDER || 'msg91',
      msg91: {
        authKey: process.env.MSG91_AUTH_KEY || '',
        senderId: process.env.MSG91_SENDER_ID || 'RAJHNS',
      },
    },
  },
  shipping: {
    provider: (process.env.SHIPPING_PROVIDER || 'shiprocket') as 'shiprocket',
    shiprocket: {
      email: process.env.SHIPROCKET_EMAIL || '',
      password: process.env.SHIPROCKET_PASSWORD || '',
      baseUrl: process.env.SHIPROCKET_BASE_URL || 'https://apiv2.shiprocket.in/v1/external',
      webhookToken: process.env.SHIPROCKET_WEBHOOK_TOKEN || '',
    },
  },
  log: {
    level: process.env.LOG_LEVEL || 'debug',
  },
} as const;
