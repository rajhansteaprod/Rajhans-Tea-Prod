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
  server.get(
    '*.*',
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

  // Serve the Angular app for all routes
  server.get('*', (req, res) => {
    res.set('Content-Type', 'text/html');
    res.send(indexHtml);
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

// Webpack will replace 'require' with '__webpack_require__'
// '__non_webpack_require__' is a proxy to Node 'require'
// The below code is to ensure that the server is run only when it is not required and is in test env
declare const __non_webpack_require__: NodeRequire;
const mainModule = __non_webpack_require__.main;
const moduleFilename = mainModule && mainModule.filename;

if (moduleFilename === __filename || moduleFilename === undefined) {
  run();
}
