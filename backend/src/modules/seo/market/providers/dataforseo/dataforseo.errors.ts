import { dataForSeoConfig } from './dataforseo.config';

export class DataForSeoQuotaExceededError extends Error {}
export class DataForSeoTransientError extends Error {}
export class DataForSeoRequestError extends Error {}

/** Redacts DataForSEO credentials / Basic-Auth header text from any error before
 * it is logged or persisted. Mirrors the existing seo/gsc.util sanitizer pattern. */
export function sanitizeDataForSeoError(e: unknown): string {
  let msg = e instanceof Error ? e.message : String(e);
  if (dataForSeoConfig.login) msg = msg.split(dataForSeoConfig.login).join('[REDACTED_LOGIN]');
  if (dataForSeoConfig.password) msg = msg.split(dataForSeoConfig.password).join('[REDACTED_PASSWORD]');
  msg = msg.replace(/Basic\s+[A-Za-z0-9+/=]+/g, 'Basic [REDACTED]');
  return msg;
}
