import { Request } from 'express';
import { IDeviceInfo } from '../models/token.model';

// ---------------------------------------------------------------------------
// IP extraction
// ---------------------------------------------------------------------------

/**
 * Extract the real client IP.
 * Behind a reverse proxy (Nginx/CloudFront), the real IP is in X-Forwarded-For.
 * X-Forwarded-For can be a comma-separated list of IPs; the first one is the client.
 */
function extractIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const raw = typeof forwarded === 'string' ? forwarded : forwarded[0];
    return raw.split(',')[0].trim();
  }
  return req.ip ?? 'Unknown';
}

// ---------------------------------------------------------------------------
// Browser parsing
// ---------------------------------------------------------------------------

/**
 * Parse a human-readable browser name + major version from a UA string.
 * Order matters: Edge and Opera both contain "Chrome/" in their UA,
 * so they must be checked BEFORE Chrome.
 */
function parseBrowser(ua: string): string {
  if (/Edg\//i.test(ua)) {
    const m = ua.match(/Edg\/(\d+)/i);
    return m ? `Edge ${m[1]}` : 'Edge';
  }
  if (/OPR\//i.test(ua)) {
    const m = ua.match(/OPR\/(\d+)/i);
    return m ? `Opera ${m[1]}` : 'Opera';
  }
  if (/SamsungBrowser\//i.test(ua)) {
    const m = ua.match(/SamsungBrowser\/(\d+)/i);
    return m ? `Samsung Browser ${m[1]}` : 'Samsung Browser';
  }
  if (/Chrome\/(\d+)/i.test(ua)) {
    const m = ua.match(/Chrome\/(\d+)/i);
    return m ? `Chrome ${m[1]}` : 'Chrome';
  }
  if (/Firefox\/(\d+)/i.test(ua)) {
    const m = ua.match(/Firefox\/(\d+)/i);
    return m ? `Firefox ${m[1]}` : 'Firefox';
  }
  if (/Safari\//i.test(ua)) {
    // Safari reports its version in "Version/X.Y" not "Safari/X.Y"
    const m = ua.match(/Version\/(\d+)/i);
    return m ? `Safari ${m[1]}` : 'Safari';
  }
  return 'Unknown Browser';
}

// ---------------------------------------------------------------------------
// OS parsing
// ---------------------------------------------------------------------------

function parseOs(ua: string): string {
  // iOS must be checked before macOS because iOS UA contains "Mac OS X" too
  if (/iPhone OS|CPU OS/i.test(ua)) {
    const m = ua.match(/(?:iPhone OS|CPU OS) (\d+)[_\s]/i);
    return m ? `iOS ${m[1]}` : 'iOS';
  }
  if (/Android/i.test(ua)) {
    const m = ua.match(/Android (\d+)/i);
    return m ? `Android ${m[1]}` : 'Android';
  }
  if (/Windows NT/i.test(ua)) {
    // NT 10.0 = Windows 10 or 11 (indistinguishable from UA)
    return 'Windows';
  }
  if (/Mac OS X/i.test(ua)) {
    const m = ua.match(/Mac OS X ([\d_]+)/i);
    if (m) {
      const version = m[1].replace(/_/g, '.').split('.').slice(0, 2).join('.');
      return `macOS ${version}`;
    }
    return 'macOS';
  }
  if (/Linux/i.test(ua)) return 'Linux';
  if (/CrOS/i.test(ua)) return 'ChromeOS';
  return 'Unknown OS';
}

// ---------------------------------------------------------------------------
// Device type
// ---------------------------------------------------------------------------

function parseDeviceType(ua: string): 'mobile' | 'desktop' | 'tablet' {
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Mobile|iPhone|Android.*Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract structured device info from an incoming Express request.
 * Call this in controllers — the result is stored with the refresh token.
 *
 * @example
 *   const deviceInfo = extractDeviceInfo(req);
 *   await authService.verifyFirebaseToken(idToken, deviceInfo);
 */
export function extractDeviceInfo(req: Request): IDeviceInfo {
  // Cap userAgent length to prevent oversized strings in DB
  const userAgent = (req.headers['user-agent'] ?? 'Unknown').substring(0, 512);
  const ip = extractIp(req);
  const browser = parseBrowser(userAgent);
  const os = parseOs(userAgent);
  const deviceType = parseDeviceType(userAgent);
  const deviceName = `${browser} on ${os}`;

  return { userAgent, ip, browser, os, deviceType, deviceName };
}
