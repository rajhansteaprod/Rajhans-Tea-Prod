import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'path';
import { config } from './config';
import { requestIdMiddleware } from './middleware/request-id.middleware';
import { requestLoggerMiddleware } from './middleware/request-logger.middleware';
import { metricsMiddleware } from './middleware/metrics.middleware';
import { globalRateLimiter } from './middleware/rate-limit.middleware';
import { errorHandler } from './middleware/error-handler.middleware';
import { notFoundHandler } from './middleware/not-found.middleware';
import apiV1Routes from './api/v1/routes';
import metricsRoutes from './api/v1/routes/metrics.routes';

const app = express();

// Security & parsing
app.use(helmet());
app.use(cors({ origin: config.cors.origin, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Rate limiting
app.use(globalRateLimiter);

// Request timeout (30s — prevents stuck requests)
import { requestTimeout } from './middleware/timeout.middleware';
app.use(requestTimeout(30000));

// Request tracking & logging
app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);
app.use(metricsMiddleware);

// Observability — trace context + latency recording
import { observabilityMiddleware } from './middleware/observability.middleware';
app.use(observabilityMiddleware);

// Static file serving for uploaded images
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Routes
app.use('/api/v1', apiV1Routes);
app.use(metricsRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
