import express from 'express';
import { join } from 'path';
import compression from 'compression';
import { readFileSync } from 'fs';

const PORT = process.env['PORT'] || 4000;
const DIST_FOLDER = join(process.cwd(), 'dist/frontend/browser');

// The Express app is exported so that it can be used by serverless functions.
export function app(): express.Express {
  const server = express();

  // Enable compression
  server.use(compression());

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
  server.get(/^\/(?!.*\.)/, (req, res) => {
    res.set('Content-Type', 'text/html');
    res.send(indexHtml);
  });

  // Fallback for any other requests
  server.use((req, res) => {
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
