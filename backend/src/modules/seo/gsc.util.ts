import { gscConfig } from './gsc.config';

/**
 * Redact any credential-shaped material from an error string BEFORE it is logged,
 * stored, or surfaced. Private keys, JWTs, and OAuth tokens must never leak.
 */
export function sanitizeGscError(err: unknown): string {
  let msg = err instanceof Error ? err.message : String(err);
  msg = msg
    .replace(/-----BEGIN[\s\S]*?PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
    .replace(/"private_key"\s*:\s*"[^"]*"/g, '"private_key":"[REDACTED]"')
    .replace(/\bey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}\b/g, '[REDACTED_JWT]')
    .replace(/\bya29\.[A-Za-z0-9._-]+/g, '[REDACTED_TOKEN]')
    .replace(/(access_token"?\s*[:=]\s*"?)[A-Za-z0-9._-]{10,}/gi, '$1[REDACTED]');
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
