import jwt from 'jsonwebtoken';
import { gscConfig } from '../gsc.config';
import { sanitizeGscError } from '../gsc.util';

/**
 * Minimal Google Search Console Search-Analytics client. Read-only.
 *
 * Auth: signs a service-account JWT (RS256) with the in-memory-decoded key and
 * exchanges it for a short-lived access token at Google's OAuth endpoint — no
 * heavyweight SDK. The private key/JWT/token never leave this module and never
 * appear in a thrown error (all failures pass through sanitizeGscError).
 */

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export interface GscRow {
  keys: string[]; // dimension values in requested order
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

let cachedToken: { token: string; expEpoch: number } | null = null;

function loadServiceAccount(): ServiceAccount {
  if (!gscConfig.saKeyBase64) throw new Error('GSC service account is not configured');
  let parsed: { client_email?: string; private_key?: string };
  try {
    parsed = JSON.parse(Buffer.from(gscConfig.saKeyBase64, 'base64').toString('utf8'));
  } catch {
    // Never include the decoded content in the error.
    throw new Error('GSC service account key is not valid base64 JSON');
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('GSC service account JSON is missing client_email/private_key');
  }
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expEpoch - 60 > now) return cachedToken.token;

  const sa = loadServiceAccount();
  const assertion = jwt.sign(
    { scope: gscConfig.scope, aud: gscConfig.tokenEndpoint, iss: sa.client_email, iat: now, exp: now + 3600 },
    sa.private_key,
    { algorithm: 'RS256' },
  );

  const res = await fetch(gscConfig.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(gscConfig.requestTimeoutMs),
  });
  // Do NOT read/echo the body — an error body can contain token material.
  if (!res.ok) throw new Error(`GSC token exchange failed: HTTP ${res.status}`);
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('GSC token exchange returned no access_token');
  cachedToken = { token: data.access_token, expEpoch: now + (data.expires_in || 3600) };
  return data.access_token;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function requestPage(url: string, body: Record<string, unknown>): Promise<{ rows?: GscRow[] }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= gscConfig.maxRetries; attempt++) {
    try {
      const token = await getAccessToken();
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(gscConfig.requestTimeoutMs),
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`GSC transient HTTP ${res.status}`); // retry
      } else if (!res.ok) {
        throw new Error(`GSC query failed: HTTP ${res.status}`);
      } else {
        return (await res.json()) as { rows?: GscRow[] };
      }
    } catch (e) {
      lastErr = e;
    }
    if (attempt < gscConfig.maxRetries) await sleep(gscConfig.retryBaseDelayMs * Math.pow(2, attempt));
  }
  throw new Error(sanitizeGscError(lastErr));
}

export interface SearchAnalyticsQuery {
  startDate: string;
  endDate: string;
  dimensions: string[];
  type?: string;
  dataState?: 'final' | 'all';
  dimensionFilterGroups?: unknown[];
}

/** Run one searchAnalytics.query, following pagination until exhausted or capped. */
export async function querySearchAnalytics(q: SearchAnalyticsQuery): Promise<GscRow[]> {
  if (!gscConfig.siteUrl) throw new Error('GSC site URL is not configured');
  const url = `${gscConfig.apiBase}/sites/${encodeURIComponent(gscConfig.siteUrl)}/searchAnalytics/query`;
  const rows: GscRow[] = [];
  let startRow = 0;
  let pages = 0;
  for (;;) {
    const page = await requestPage(url, {
      startDate: q.startDate,
      endDate: q.endDate,
      dimensions: q.dimensions,
      type: q.type ?? 'web',
      dataState: q.dataState ?? 'final',
      dimensionFilterGroups: q.dimensionFilterGroups,
      rowLimit: gscConfig.rowLimit,
      startRow,
    });
    pages++;
    const batch = page.rows ?? [];
    rows.push(...batch);
    if (batch.length < gscConfig.rowLimit || rows.length >= gscConfig.maxRows) break;
    startRow += gscConfig.rowLimit;
  }
  return rows;
}

/** Lightweight auth+access probe (no data) for the dry-run report. */
export async function verifyAccess(): Promise<{ ok: boolean; detail: string }> {
  try {
    await getAccessToken();
    return { ok: true, detail: 'authenticated' };
  } catch (e) {
    return { ok: false, detail: sanitizeGscError(e) };
  }
}

/** Reset the in-memory token cache (tests). */
export function _resetTokenCache(): void {
  cachedToken = null;
}
