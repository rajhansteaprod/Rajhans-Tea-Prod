import express from 'express';
import { join } from 'path';
import compression from 'compression';
import { readFileSync } from 'fs';

// Declare Node.js globals for CommonJS
declare const require: any;
declare const module: any;

const PORT = process.env['PORT'] || 4000;
const API_URL = process.env['API_URL'] || 'http://localhost:3000';
const DIST_FOLDER = join(process.cwd(), 'dist/frontend/browser');

// Simple API proxy middleware
function createApiProxy(apiUrl: string) {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const targetUrl = new URL(req.originalUrl, apiUrl).toString();
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers[key] = value;
      }
      headers['host'] = new URL(apiUrl).host;

      const fetchRes = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
      });
      const data = await fetchRes.text();
      res.status(fetchRes.status);

      // Copy backend response headers
      fetchRes.headers.forEach((value, key) => {
        // Skip headers that might conflict with CORS
        if (!['access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers'].includes(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      });

      // Ensure CORS headers are always present
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

      res.send(data);
    } catch (err) {
      next(err);
    }
  };
}

// The Express app is exported so that it can be used by serverless functions.
export function app(): express.Express {
  const server = express();

  // Enable compression
  server.use(compression());

  // CORS headers for development
  server.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    return next();
  });

  // Parse JSON bodies
  server.use(express.json());
  server.use(express.urlencoded({ extended: true }));

  // Proxy API requests to backend
  server.use('/api', createApiProxy(API_URL));

  // Serve static files from /browser
  server.use(
    express.static(DIST_FOLDER, {
      maxAge: '1y',
    })
  );

  // Read the index.html template
  const indexPath = join(DIST_FOLDER, 'index.html');
  let indexHtml: string;

  try {
    indexHtml = readFileSync(indexPath, 'utf-8');
  } catch (err) {
    console.error('Error reading index.html:', err);
    indexHtml = '<html><body>Frontend not built. Run "npm run build" first.</body></html>';
  }

  // Serve the Angular app for all routes (use regex to catch all non-file routes)
  server.get(/^\/(?!.*\.)/, (req: express.Request, res: express.Response) => {
    res.set('Content-Type', 'text/html');
    res.send(indexHtml);
  });

  // Fallback for any other requests
  server.use((req: express.Request, res: express.Response) => {
    res.status(404).send('<html><body>Not Found</body></html>');
  });

  return server;
}

function run(): void {
  const port = PORT;

  // Start up the Node server
  const server = app();
  server.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

// Run server when invoked directly
// For webpack bundles: webpack will replace 'require' with __webpack_require__
// For direct Node.js execution: check if this is the main module
const isMainModule = require.main === module;
if (isMainModule) {
  run();
}
