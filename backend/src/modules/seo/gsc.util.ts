import { gscConfig } from './gsc.config';

/**
 * Redact any credential-shaped material from an error string BEFORE it is logged,
 * stored, or surfaced. Order matters: whole-block secrets (PEM, JSON key values,
 * long base64 blobs) are removed first, then token/JWT patterns. The result must
 * contain no recoverable credential fragment.
 */
export function sanitizeGscError(err: unknown): string {
  let msg = err instanceof Error ? err.message : String(err);
  msg = msg
    // Full PEM block — BEGIN marker + body + END marker, incl. escaped \n bodies.
    .replace(/-----BEGIN[^-]*?PRIVATE KEY-----[\s\S]*?-----END[^-]*?PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
    // A PEM that lost its END marker (defensive): from BEGIN to end of string.
    .replace(/-----BEGIN[^-]*?PRIVATE KEY-----[\s\S]*/g, '[REDACTED_PRIVATE_KEY]')
    // JSON credential fields: "private_key":"…", "client_secret":"…", etc.
    .replace(/"(private_key|client_secret|refresh_token|access_token|id_token|assertion|client_email)"\s*:\s*"(?:\\.|[^"\\])*"/gi, '"$1":"[REDACTED]"')
    // Bearer tokens.
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    // JWTs (three base64url segments starting `ey…`) — assertions, id tokens, etc.
    .replace(/\bey[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]{2,}/g, '[REDACTED_JWT]')
    // Google OAuth access tokens.
    .replace(/\bya29\.[A-Za-z0-9._-]+/g, '[REDACTED_TOKEN]')
    // token=… / access_token=… / refresh_token=… (query/kv form).
    .replace(/\b((?:access_|refresh_|id_)?token|assertion|client_secret)\s*[:=]\s*"?[A-Za-z0-9._~+/=-]{8,}"?/gi, '$1=[REDACTED]')
    // Long base64 blobs (e.g. a GSC_SA_KEY_BASE64 value) — credential-shaped, not prose.
    .replace(/[A-Za-z0-9+/]{120,}={0,2}/g, '[REDACTED_BASE64]');
  return msg;
}

/** A closed, complete date window [start, end] inclusive (YYYY-MM-DD). */
export interface DateWindow {
  start: string;
  end: string;
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const addDays = (base: Date, days: number): Date => {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

/** The most recent day with FINAL data (today − dataLagDays). */
export function lastFinalDate(today = new Date()): string {
  return iso(addDays(today, -gscConfig.dataLagDays));
}

/**
 * Two EQUAL, COMPLETE, adjacent windows ending at the last final date — used for
 * trend comparisons so an incomplete period is never compared to a complete one.
 * `latest` = last N final days; `previous` = the N days immediately before it.
 */
export function trendWindows(windowDays = gscConfig.opportunityWindowDays, today = new Date()): {
  latest: DateWindow;
  previous: DateWindow;
} {
  const end = addDays(today, -gscConfig.dataLagDays);
  const latestStart = addDays(end, -(windowDays - 1));
  const prevEnd = addDays(latestStart, -1);
  const prevStart = addDays(prevEnd, -(windowDays - 1));
  return {
    latest: { start: iso(latestStart), end: iso(end) },
    previous: { start: iso(prevStart), end: iso(prevEnd) },
  };
}

/** The opportunity window (latest complete N days). */
export function opportunityWindow(today = new Date()): DateWindow {
  return trendWindows(gscConfig.opportunityWindowDays, today).latest;
}

/** The initial backfill window (trailing backfillDays, up to the last final date). */
export function backfillWindow(today = new Date()): DateWindow {
  const end = addDays(today, -gscConfig.dataLagDays);
  return { start: iso(addDays(end, -(gscConfig.backfillDays - 1))), end: iso(end) };
}
