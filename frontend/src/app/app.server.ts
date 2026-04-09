import { App } from './app';
import { config } from './app.config.server';
import { ApplicationRef } from '@angular/core';

/**
 * Server app configuration export
 * Used by @nguniversal/express-engine for server-side rendering
 */
export { App as AppServerModule };
export { config };
