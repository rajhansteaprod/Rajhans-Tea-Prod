import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import { createProxyMiddleware } from 'http-proxy-middleware';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const API_URL = process.env['API_URL'] || 'http://localhost:3000';

// Hosts allowed to trigger server-side rendering (SSRF protection built into
// AngularNodeAppEngine). Configure via comma-separated NG_ALLOWED_HOSTS env var.
// Requests with a Host header not in this list still work, but fall back to
// serving the static (non-per-route) HTML instead of full SSR.
const allowedHosts = (process.env['NG_ALLOWED_HOSTS'] || 'rajhanstea.com,*.rajhanstea.com,localhost')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

const app = express();
const angularApp = new AngularNodeAppEngine({ allowedHosts });

// Enable compression
app.use(compression() as any);

// CORS headers for development
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  return next();
});

// Proxy API requests to backend FIRST (before body parsing)
// This preserves multipart/form-data and other raw request bodies
app.use(
  '/api',
  createProxyMiddleware({
    target: API_URL,
    changeOrigin: true,
    ws: true,
    logLevel: 'debug',
  }) as any,
);

// Proxy uploaded files to backend
app.use(
  '/uploads',
  createProxyMiddleware({
    target: API_URL,
    changeOrigin: true,
    logLevel: 'debug',
  }) as any,
);

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application via
 * AngularNodeAppEngine (real server-side rendering — resolves per-route
 * component data, meta tags, etc., not a static index.html passthrough).
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

/**
 * Start the server if this module is the main entry point.
 * The server can also be run from a Node Express Server, such as
 * the local dev server, using a similar mechanism.
 */
if (isMainModule(import.meta.url)) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or
 * Node.js server when serving the application.
 */
export const reqHandler = createNodeRequestHandler(app);
