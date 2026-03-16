import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { requestIdMiddleware } from './middleware/request-id.middleware';
import { requestLoggerMiddleware } from './middleware/request-logger.middleware';
import { metricsMiddleware } from './middleware/metrics.middleware';
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

// Request tracking & logging
app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);
app.use(metricsMiddleware);

// Routes
app.use('/api/v1', apiV1Routes);
app.use(metricsRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
