import crypto from 'crypto';
import { config } from '../../../config';
import { logger } from '../../../utils/logger';

/** SHA-256 of a trimmed, lowercased value (Meta's normalization for PII). */
function hash(value?: string | null): string | undefined {
  const v = value?.trim().toLowerCase();
  return v ? crypto.createHash('sha256').update(v).digest('hex') : undefined;
}

/** Phone: digits only, default to India (+91) for a bare 10-digit number, then hash. */
function hashPhone(phone?: string | null): string | undefined {
  let d = phone?.replace(/\D/g, '') ?? '';
  if (!d) return undefined;
  if (d.length === 10) d = '91' + d;
  return crypto.createHash('sha256').update(d).digest('hex');
}

export interface MetaUserData {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
}

export interface MetaEventInput {
  eventName: string;
  eventId: string;
  eventSourceUrl?: string;
  customData?: Record<string, unknown>;
  userData: MetaUserData;
}

function buildUserData(u: MetaUserData): Record<string, unknown> {
  const ud: Record<string, unknown> = {};
  const em = hash(u.email);      if (em) ud.em = [em];
  const ph = hashPhone(u.phone); if (ph) ud.ph = [ph];
  const fn = hash(u.firstName);  if (fn) ud.fn = [fn];
  const ln = hash(u.lastName);   if (ln) ud.ln = [ln];
  const ct = hash(u.city);       if (ct) ud.ct = [ct];
  const st = hash(u.state);      if (st) ud.st = [st];
  const zp = hash(u.zip);        if (zp) ud.zp = [zp];
  if (u.fbp) ud.fbp = u.fbp;
  if (u.fbc) ud.fbc = u.fbc;
  if (u.clientIp) ud.client_ip_address = u.clientIp;
  if (u.userAgent) ud.client_user_agent = u.userAgent;
  return ud;
}

/**
 * Sends a single server event to the Meta Conversions API. Fire-and-forget:
 * never throws to the caller; every failure is logged loudly with the event
 * name, event id and Meta's full response body. The access token is sent in
 * the POST body (never the URL) so it can't leak into access/proxy/APM logs.
 */
export async function sendMetaEvent(input: MetaEventInput): Promise<void> {
  if (!config.meta.pixelId || !config.meta.capiToken) {
    logger.warn(
      { event: input.eventName, eventId: input.eventId },
      '[meta-capi] META_PIXEL_ID / META_CAPI_ACCESS_TOKEN not set — skipping',
    );
    return;
  }

  const event: Record<string, unknown> = {
    event_name: input.eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: input.eventId,
    action_source: 'website',
    event_source_url: input.eventSourceUrl,
    user_data: buildUserData(input.userData),
    custom_data: input.customData,
  };

  const payload: Record<string, unknown> = {
    data: [event],
    access_token: config.meta.capiToken,
  };
  if (config.meta.testEventCode) payload.test_event_code = config.meta.testEventCode;

  const url = `https://graph.facebook.com/${config.meta.apiVersion}/${config.meta.pixelId}/events`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const metaResponse = await res.text();
      logger.error(
        { event: input.eventName, eventId: input.eventId, status: res.status, metaResponse },
        '[meta-capi] CAPI request FAILED',
      );
      return;
    }
    logger.info({ event: input.eventName, eventId: input.eventId }, '[meta-capi] sent');
  } catch (err) {
    logger.error(
      { event: input.eventName, eventId: input.eventId, error: String(err) },
      '[meta-capi] CAPI request THREW',
    );
  }
}
