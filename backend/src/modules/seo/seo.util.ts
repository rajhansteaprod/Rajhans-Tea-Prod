import { createHash } from 'crypto';

/**
 * Canonicalize a URL for stable comparison/fingerprinting. Lowercases the host,
 * drops the fragment, strips default ports, and preserves the path EXACTLY
 * (trailing slash is significant on this site — /page/x/ and /page/x are distinct
 * and one 301s to the other). Query strings are preserved.
 */
export function normalizeUrl(input: string, base?: string): string {
  try {
    const u = base ? new URL(input, base) : new URL(input);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    if (
      (u.protocol === 'https:' && u.port === '443') ||
      (u.protocol === 'http:' && u.port === '80')
    ) {
      u.port = '';
    }
    return u.toString();
  } catch {
    return input;
  }
}

/** Stable issue fingerprint: same URL + check + discriminator ⇒ same finding. */
export function fingerprint(normalizedUrl: string, checkId: string, discriminator = ''): string {
  return createHash('sha1')
    .update(`${normalizedUrl}::${checkId}::${discriminator}`)
    .digest('hex');
}

/** Same-origin test against the configured base (internal-link classification). */
export function isSameOrigin(url: string, baseUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}
