import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';

// KNOWN OPEN ISSUE (why this branch is NOT deployed): Angular 21 SSR's Host
// allowlist rejects proxied requests and deopts dynamic routes to an empty CSR
// shell. Configuring angular.json security.allowedHosts (baked into the manifest)
// did not take effect at runtime in local testing. Must be resolved before this
// branch can ship — do not bypass the check to force it.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// NOTE: This entry is used by the Angular CLI's build-time prerender step to
// render each route to static HTML (see app.routes.server.ts). It is NOT
// deployed as a persistent runtime server — the site is served as static
// files by Nginx, same as before. This file only needs to exist and be a
// valid @angular/ssr entry so `ng build`'s prerender pass can run.

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const app = express();
// Allowed hosts (Angular SSRF protection) are configured at build time in
// angular.json → architect.build.options.security.allowedHosts, which is baked
// into the server manifest the engine reads.
const angularApp = new AngularNodeAppEngine();

app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

if (isMainModule(import.meta.url)) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
